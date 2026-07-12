import bcrypt from "bcryptjs";

/**
 * Password hashing for room passwords.
 *
 * Room passwords are low-value (they just gate a casual game room), so we
 * use salted SHA-256 via Web Crypto instead of bcrypt. bcryptjs runs
 * synchronously and would otherwise block the whole mutation transaction.
 *
 * These are plain async helper functions (NOT Convex mutations) so they can
 * be awaited directly inside a mutation without an extra runMutation hop.
 *
 * Legacy support: hashes created by the old bcrypt-based implementation are
 * still verifiable (bcrypt hashes always start with "$2").
 */

const SALT_BYTES = 16;

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return toHex(digest);
}

/**
 * Hash a password, returning a string of the form "salt:hash" (both hex).
 */
export async function hashPassword(password: string): Promise<string> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const salt = toHex(saltBytes);
  const encoder = new TextEncoder();
  const combined = new Uint8Array([...saltBytes, ...encoder.encode(password)]);
  const hash = await sha256Hex(combined);
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash. Supports both the current
 * "salt:hash" (SHA-256) format and legacy bcrypt hashes (prefix "$2").
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (stored.startsWith("$2")) {
    // Legacy bcrypt hash
    return bcrypt.compareSync(password, stored);
  }

  const [salt, expectedHash] = stored.split(":");
  if (!salt || !expectedHash) return false;

  const saltBytes = fromHex(salt);
  const encoder = new TextEncoder();
  const combined = new Uint8Array([...saltBytes, ...encoder.encode(password)]);
  const actualHash = await sha256Hex(combined);
  return actualHash === expectedHash;
}
