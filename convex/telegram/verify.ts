/**
 * Verification of Telegram Mini App `initData`.
 *
 * Telegram signs the launch parameters it hands a Mini App with an HMAC keyed
 * by the bot token, which is the only thing that makes a claimed user id
 * trustworthy. Everything in this file is pure (no Convex, no network) so the
 * signature logic can be exhaustively unit-tested - see verify.test.ts.
 *
 * Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ParsedInitData {
  user: TelegramUser;
  authDate: number;
  /** Value passed through `?startapp=` on a direct Mini App link. */
  startParam?: string;
  chatType?: string;
  chatInstance?: string;
  queryId?: string;
}

export type VerifyResult =
  | { ok: true; data: ParsedInitData }
  | { ok: false; error: string };

/** Reject initData older than this. It is minted when the app opens, so the
 *  window can be tight without ever inconveniencing a real user. */
export const MAX_INIT_DATA_AGE_MS = 15 * 60 * 1000;

/**
 * Fields that must be excluded from the data-check-string. `hash` is the
 * value we are verifying; `signature` belongs to Telegram's separate
 * third-party Ed25519 scheme and is not covered by the HMAC.
 */
const EXCLUDED_FIELDS = new Set(["hash", "signature"]);

const encoder = new TextEncoder();

async function hmacSha256(key: ArrayBuffer | Uint8Array, message: string): Promise<ArrayBuffer> {
  const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message) as unknown as BufferSource);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Compare two hex strings without leaking their contents through timing.
 * Length is compared up front because it is not secret.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Build the data-check-string: every field except the excluded ones, as
 * `key=value`, sorted alphabetically by key, joined by newlines.
 */
export function buildDataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  return pairs.join("\n");
}

/**
 * Verify an `initData` query string and return its parsed contents.
 *
 * Returns a result object rather than throwing: callers turn failures into
 * user-facing states, and an exception here would be indistinguishable from a
 * bug in the surrounding action.
 */
export async function verifyInitData(
  initData: string,
  botToken: string,
  options: { now?: number; maxAgeMs?: number } = {}
): Promise<VerifyResult> {
  if (!botToken) {
    return { ok: false, error: "Bot token is not configured" };
  }
  if (!initData) {
    return { ok: false, error: "Missing initData" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, error: "Malformed initData" };
  }

  const hash = params.get("hash");
  if (!hash) {
    return { ok: false, error: "Missing hash" };
  }

  const dataCheckString = buildDataCheckString(params);

  // secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  // expected_hash = HMAC_SHA256(key=secret_key, message=data_check_string)
  const expectedHash = toHex(await hmacSha256(secretKey, dataCheckString));

  if (!constantTimeEquals(expectedHash, hash.toLowerCase())) {
    return { ok: false, error: "Signature verification failed" };
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : NaN;
  if (!Number.isFinite(authDate)) {
    return { ok: false, error: "Missing or invalid auth_date" };
  }

  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? MAX_INIT_DATA_AGE_MS;
  const ageMs = now - authDate * 1000;
  // A small negative age is normal clock skew; a large one is not.
  if (ageMs > maxAgeMs || ageMs < -maxAgeMs) {
    return { ok: false, error: "initData has expired, please reopen the game" };
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    return { ok: false, error: "Missing user" };
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return { ok: false, error: "Malformed user" };
  }

  if (typeof user?.id !== "number" || !Number.isFinite(user.id)) {
    return { ok: false, error: "Malformed user id" };
  }

  return {
    ok: true,
    data: {
      user,
      authDate,
      startParam: params.get("start_param") ?? undefined,
      chatType: params.get("chat_type") ?? undefined,
      chatInstance: params.get("chat_instance") ?? undefined,
      queryId: params.get("query_id") ?? undefined,
    },
  };
}

/**
 * Sign an initData string the way Telegram would. Test-only helper, exported
 * from the module under test so fixtures can never drift from the verifier.
 */
export async function signInitDataForTest(
  fields: Record<string, string>,
  botToken: string
): Promise<string> {
  const params = new URLSearchParams(fields);
  const secretKey = await hmacSha256(encoder.encode("WebAppData"), botToken);
  const hash = toHex(await hmacSha256(secretKey, buildDataCheckString(params)));
  params.set("hash", hash);
  return params.toString();
}

/** Display name for a Telegram user, capped to the app's nickname length. */
export function displayName(user: TelegramUser, maxLength = 20): string {
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const name = full || user.username || `Player ${user.id}`;
  return name.slice(0, maxLength);
}
