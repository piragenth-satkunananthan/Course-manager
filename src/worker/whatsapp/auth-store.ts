// Baileys' AuthenticationState on Postgres (design file 59), replacing its file-based demo store. Credentials live
// in wa_session.creds_enc and signal keys in wa_auth_key, all encrypted (§12).
import { and, eq, inArray } from "drizzle-orm";
import { type AuthenticationCreds, BufferJSON, initAuthCreds, proto, type SignalDataSet, type SignalDataTypeMap, type SignalKeyStore } from "baileys";
import { decrypt, encrypt } from "@/server/crypto";
import { db } from "@/server/db/client";
import { waAuthKey, waSession } from "@/server/db/schema";

const seal = (value: unknown, key: Buffer) => encrypt(JSON.stringify(value, BufferJSON.replacer), key);
const open = (data: Buffer, key: Buffer) => JSON.parse(decrypt(data, key), BufferJSON.reviver);

export async function loadAuthState(studentId: string, key: Buffer) {
  const [row] = await db.select({ credsEnc: waSession.credsEnc }).from(waSession).where(eq(waSession.studentId, studentId));
  const creds: AuthenticationCreds = row?.credsEnc ? open(row.credsEnc, key) : initAuthCreds();

  const keys: SignalKeyStore = {
    async get<T extends keyof SignalDataTypeMap>(type: T, ids: string[]) {
      const rows = ids.length
        ? await db.select().from(waAuthKey).where(and(eq(waAuthKey.studentId, studentId), eq(waAuthKey.keyType, type), inArray(waAuthKey.keyId, ids)))
        : [];
      const out: { [id: string]: SignalDataTypeMap[T] } = {};
      for (const r of rows) {
        const value = open(r.valueEnc, key);
        out[r.keyId] = type === "app-state-sync-key" ? (proto.Message.AppStateSyncKeyData.fromObject(value) as unknown as SignalDataTypeMap[T]) : value;
      }
      return out;
    },
    async set(data: SignalDataSet) {
      await db.transaction(async (tx) => {
        for (const [type, entries] of Object.entries(data)) {
          for (const [keyId, value] of Object.entries(entries ?? {})) {
            const where = and(eq(waAuthKey.studentId, studentId), eq(waAuthKey.keyType, type), eq(waAuthKey.keyId, keyId));
            if (value == null) await tx.delete(waAuthKey).where(where);
            else {
              const valueEnc = seal(value, key);
              await tx.insert(waAuthKey).values({ studentId, keyType: type, keyId, valueEnc }).onConflictDoUpdate({ target: [waAuthKey.studentId, waAuthKey.keyType, waAuthKey.keyId], set: { valueEnc } });
            }
          }
        }
      });
    },
  };

  return {
    creds,
    keys,
    saveCreds: () => db.update(waSession).set({ credsEnc: seal(creds, key) }).where(eq(waSession.studentId, studentId)),
  };
}

/** Forget the link: credentials and every key. */
export async function wipeAuth(studentId: string) {
  await db.transaction(async (tx) => {
    await tx.delete(waAuthKey).where(eq(waAuthKey.studentId, studentId));
    await tx.update(waSession).set({ credsEnc: null }).where(eq(waSession.studentId, studentId));
  });
}
