// Encryption of WhatsApp keys and message text (design §12, file 20): AES-256-GCM with DATA_ENCRYPTION_KEY.
// Stored format: [keyVersion:1][nonce:12][ciphertext][tag:16]. The version byte lets the key be rotated later.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;

export function loadKey(b64: string | undefined = process.env.DATA_ENCRYPTION_KEY): Buffer {
  if (!b64) throw new Error("DATA_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("DATA_ENCRYPTION_KEY must decode to 32 bytes");
  return key;
}

export function encrypt(plain: string, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, nonce);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([VERSION]), nonce, body, c.getAuthTag()]);
}

export function decrypt(data: Buffer, key: Buffer): string {
  if (data[0] !== VERSION) throw new Error(`unknown key version ${data[0]}`);
  const d = createDecipheriv("aes-256-gcm", key, data.subarray(1, 13));
  d.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([d.update(data.subarray(13, data.length - 16)), d.final()]).toString("utf8");
}
