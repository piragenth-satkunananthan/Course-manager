// AES-256-GCM for spike data at rest. One line = "v1:<iv>:<tag>:<ciphertext>", all base64.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function loadKey(b64: string | undefined): Buffer {
  if (!b64) throw new Error("DATA_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encryptLine(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv, c.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

export function decryptLine(line: string, key: Buffer): string {
  const [v, iv, tag, ct] = line.split(":");
  if (v !== "v1" || !ct) throw new Error("not a v1 line");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}
