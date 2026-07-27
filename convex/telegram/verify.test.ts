import { describe, it, expect } from "vitest";
import {
  verifyInitData,
  signInitDataForTest,
  buildDataCheckString,
  constantTimeEquals,
  displayName,
  MAX_INIT_DATA_AGE_MS,
} from "./verify";

const BOT_TOKEN = "123456:TEST-TOKEN-not-a-real-bot-token";
const AUTH_DATE = 1_700_000_000; // seconds
const NOW = AUTH_DATE * 1000 + 1000; // 1s after issue

const USER = {
  id: 42,
  first_name: "Ada",
  last_name: "Lovelace",
  username: "ada",
};

function baseFields(overrides: Record<string, string> = {}) {
  return {
    user: JSON.stringify(USER),
    auth_date: String(AUTH_DATE),
    start_param: "ABC123",
    chat_type: "supergroup",
    ...overrides,
  };
}

describe("buildDataCheckString", () => {
  it("sorts keys alphabetically and joins with newlines", () => {
    const params = new URLSearchParams({ c: "3", a: "1", b: "2" });
    expect(buildDataCheckString(params)).toBe("a=1\nb=2\nc=3");
  });

  it("excludes hash", () => {
    const params = new URLSearchParams({ a: "1", hash: "deadbeef" });
    expect(buildDataCheckString(params)).toBe("a=1");
  });

  // Regression: `signature` was originally excluded here alongside `hash`.
  // That rule belongs to the third-party Ed25519 check, not the bot-token
  // HMAC, and dropping it made every real Bot API 8.0+ launch fail while
  // synthetic payloads (which carry no signature) kept passing.
  it("includes signature, which counts as a received field", () => {
    const params = new URLSearchParams({
      a: "1",
      hash: "deadbeef",
      signature: "ed25519sig",
    });
    expect(buildDataCheckString(params)).toBe("a=1\nsignature=ed25519sig");
  });
});

describe("constantTimeEquals", () => {
  it("matches identical strings", () => {
    expect(constantTimeEquals("abc123", "abc123")).toBe(true);
  });

  it("rejects differing strings of equal length", () => {
    expect(constantTimeEquals("abc123", "abc124")).toBe(false);
  });

  it("rejects strings of differing length", () => {
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
  });
});

describe("verifyInitData", () => {
  it("accepts a correctly signed payload and parses its fields", async () => {
    const initData = await signInitDataForTest(baseFields(), BOT_TOKEN);

    const result = await verifyInitData(initData, BOT_TOKEN, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.user.id).toBe(42);
    expect(result.data.user.first_name).toBe("Ada");
    expect(result.data.authDate).toBe(AUTH_DATE);
    expect(result.data.startParam).toBe("ABC123");
    expect(result.data.chatType).toBe("supergroup");
  });

  it("rejects a payload whose field was tampered with after signing", async () => {
    const initData = await signInitDataForTest(baseFields(), BOT_TOKEN);

    // Swap in a different user id, keeping the original hash.
    const params = new URLSearchParams(initData);
    params.set("user", JSON.stringify({ ...USER, id: 999 }));

    const result = await verifyInitData(params.toString(), BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Signature verification failed" });
  });

  // The shape a real Bot API 8.0+ client sends. Without a case like this,
  // mishandling `signature` is invisible: every other fixture omits it.
  it("accepts a real-shaped payload carrying a signature field", async () => {
    const initData = await signInitDataForTest(
      baseFields({
        signature: "Aq7Vn0_5xK2mBqZ8tYw3PdLcRfHgJkNpQsTuVwXyZaBcDeFgHiJkLmNoPqRsTuVw",
        chat_instance: "-1234567890123456789",
      }),
      BOT_TOKEN
    );

    const result = await verifyInitData(initData, BOT_TOKEN, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.user.id).toBe(42);
  });

  it("rejects a payload whose signature field was swapped after signing", async () => {
    const initData = await signInitDataForTest(
      baseFields({ signature: "originalSignatureValue" }),
      BOT_TOKEN
    );

    const params = new URLSearchParams(initData);
    params.set("signature", "tamperedSignatureValue");

    const result = await verifyInitData(params.toString(), BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Signature verification failed" });
  });

  it("rejects a payload signed with a different bot token", async () => {
    const initData = await signInitDataForTest(baseFields(), "999:SOME-OTHER-TOKEN");

    const result = await verifyInitData(initData, BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Signature verification failed" });
  });

  it("rejects a payload with no hash at all", async () => {
    const params = new URLSearchParams(baseFields());

    const result = await verifyInitData(params.toString(), BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Missing hash" });
  });

  it("rejects a payload older than the freshness window", async () => {
    const initData = await signInitDataForTest(baseFields(), BOT_TOKEN);

    const result = await verifyInitData(initData, BOT_TOKEN, {
      now: AUTH_DATE * 1000 + MAX_INIT_DATA_AGE_MS + 1000,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/expired/);
  });

  it("accepts a payload right at the edge of the freshness window", async () => {
    const initData = await signInitDataForTest(baseFields(), BOT_TOKEN);

    const result = await verifyInitData(initData, BOT_TOKEN, {
      now: AUTH_DATE * 1000 + MAX_INIT_DATA_AGE_MS,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects a far-future auth_date, which cannot be honest clock skew", async () => {
    const initData = await signInitDataForTest(baseFields(), BOT_TOKEN);

    const result = await verifyInitData(initData, BOT_TOKEN, {
      now: AUTH_DATE * 1000 - MAX_INIT_DATA_AGE_MS - 1000,
    });

    expect(result.ok).toBe(false);
  });

  it("rejects a signed payload that carries no user", async () => {
    const initData = await signInitDataForTest(
      { auth_date: String(AUTH_DATE) },
      BOT_TOKEN
    );

    const result = await verifyInitData(initData, BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Missing user" });
  });

  it("rejects a signed payload whose user JSON is malformed", async () => {
    const initData = await signInitDataForTest(
      { user: "{not json", auth_date: String(AUTH_DATE) },
      BOT_TOKEN
    );

    const result = await verifyInitData(initData, BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Malformed user" });
  });

  it("rejects an empty initData", async () => {
    const result = await verifyInitData("", BOT_TOKEN, { now: NOW });

    expect(result).toEqual({ ok: false, error: "Missing initData" });
  });

  it("rejects when the bot token is not configured", async () => {
    const initData = await signInitDataForTest(baseFields(), BOT_TOKEN);

    const result = await verifyInitData(initData, "", { now: NOW });

    expect(result).toEqual({ ok: false, error: "Bot token is not configured" });
  });

  it("verifies payloads containing characters that need URL encoding", async () => {
    const initData = await signInitDataForTest(
      baseFields({
        user: JSON.stringify({ id: 7, first_name: "Ann & Bob", last_name: "O'Neil =+" }),
      }),
      BOT_TOKEN
    );

    const result = await verifyInitData(initData, BOT_TOKEN, { now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.user.first_name).toBe("Ann & Bob");
  });
});

describe("displayName", () => {
  it("prefers first + last name", () => {
    expect(displayName(USER)).toBe("Ada Lovelace");
  });

  it("falls back to username when no first name is present", () => {
    expect(displayName({ id: 1, first_name: "", username: "solo" })).toBe("solo");
  });

  it("falls back to the user id when nothing else is available", () => {
    expect(displayName({ id: 5, first_name: "" })).toBe("Player 5");
  });

  it("caps long names at the nickname length limit", () => {
    const long = displayName({ id: 1, first_name: "A".repeat(50) });
    expect(long).toHaveLength(20);
  });
});
