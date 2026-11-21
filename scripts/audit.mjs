// npm audit at high severity, excusing allowlisted packages until their review date (design §12).
// audit-allowlist.json: [{ "name": "<package>", "reason": "…", "reviewBy": "YYYY-MM-DD" }]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

let out;
try {
  out = execFileSync("npm", ["audit", "--json"], { encoding: "utf8" });
} catch (e) {
  out = e.stdout; // npm audit exits non-zero when it finds anything
}
const report = JSON.parse(out);
if (report.error || !report.vulnerabilities) {
  console.error(`npm audit could not run: ${report.error?.summary ?? "no vulnerabilities field in its output"}`);
  process.exit(1);
}
const vulns = Object.values(report.vulnerabilities);
const today = new Date().toISOString().slice(0, 10);
const allowed = new Map(JSON.parse(readFileSync("audit-allowlist.json", "utf8")).map((a) => [a.name, a]));

let failed = false;
for (const v of vulns.filter((v) => v.severity === "high" || v.severity === "critical")) {
  const a = allowed.get(v.name);
  if (a && a.reviewBy >= today) console.log(`allowed until ${a.reviewBy}: ${v.name} (${v.severity}) — ${a.reason}`);
  else {
    failed = true;
    console.error(`${a ? "allowlist entry expired" : "not allowlisted"}: ${v.name} (${v.severity})`);
  }
}
console.log(failed ? "npm audit: failed" : `npm audit: ok (${vulns.length} below high or allowlisted)`);
process.exit(failed ? 1 : 0);
