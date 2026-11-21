import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptLine, encryptLine, loadKey } from "./crypto.ts";

const key = randomBytes(32);

describe("message crypto", () => {
  it("decrypts what it encrypted", () => {
    const line = encryptLine("Assignment 2 due Friday 4.30", key);
    expect(line).not.toContain("Assignment");
    expect(decryptLine(line, key)).toBe("Assignment 2 due Friday 4.30");
  });

  it("rejects a tampered line", () => {
    const [v, iv, tag, ct] = encryptLine("due Friday", key).split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 1;
    expect(() => decryptLine([v, iv, tag, flipped.toString("base64")].join(":"), key)).toThrow();
  });

  it("rejects the wrong key", () => {
    expect(() => decryptLine(encryptLine("due Friday", key), randomBytes(32))).toThrow();
  });

  it("loads a base64 32-byte key and refuses anything else", () => {
    expect(loadKey(key.toString("base64")).equals(key)).toBe(true);
    expect(() => loadKey(undefined)).toThrow(/DATA_ENCRYPTION_KEY/);
    expect(() => loadKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
