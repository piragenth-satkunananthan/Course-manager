// M0 spike: read the listener's encrypted message file.
//   --counts           messages per group per day (CSV, no text; no key needed)
//   (default)          decrypted JSONL on stdout; redirect it OUTSIDE the repo, e.g. into $AI_EVAL_DIR
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decryptLine, loadKey } from "./crypto.ts";

const file = join(process.env.SPIKE_DATA_DIR ?? "spikes/m0/data", "messages.enc.jsonl");
const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

if (process.argv.includes("--counts")) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    // day in Asia/Colombo, from the sent time (or arrival time for revokes, which carry none)
    const day = new Date((r.sentAt ? r.sentAt * 1000 : Date.parse(r.receivedAt)) + 5.5 * 3600_000).toISOString().slice(0, 10);
    const k = `${r.group},${day},${r.type}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  console.log("group,day,type,count");
  for (const [k, n] of [...counts].sort()) console.log(`${k},${n}`);
} else {
  const key = loadKey(process.env.DATA_ENCRYPTION_KEY);
  for (const { enc, ...meta } of rows) console.log(JSON.stringify({ ...meta, ...JSON.parse(decryptLine(enc, key)) }));
}
