import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt, loadKey } from "@/server/crypto";

const key = loadKey(randomBytes(32).toString("base64"));

describe("crypto (AES-256-GCM, [version][nonce][ciphertext][tag])", () => {
  it("round-trips, with a fresh nonce each time", () => {
    const a = encrypt("Lab 4 due Friday 4.30", key);
    expect(decrypt(a, key)).toBe("Lab 4 due Friday 4.30");
    expect(encrypt("x", key).equals(encrypt("x", key))).toBe(false);
    expect(a[0]).toBe(1);
  });

  it("refuses a tampered value, another key, or an unknown key version", () => {
    const a = encrypt("secret", key);
    const tampered = Buffer.from(a);
    tampered[20]! ^= 1;
    expect(() => decrypt(tampered, key)).toThrow();
    expect(() => decrypt(a, loadKey(randomBytes(32).toString("base64")))).toThrow();
    const v2 = Buffer.from(a);
    v2[0] = 2;
    expect(() => decrypt(v2, key)).toThrow(/key version/);
  });

  it("refuses a missing or wrong-sized key", () => {
    expect(() => loadKey(undefined)).toThrow(/DATA_ENCRYPTION_KEY/);
    expect(() => loadKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
