// JSON-lines logger (design file 34). Never logs message text, prompts, bodies or secrets.
const REDACT = /^(text|prompt|body|password|token|key|secret|cookie)$/i;

const clean = (v: unknown, depth = 0): unknown => {
  if (v instanceof Error) return { name: v.name, message: v.message };
  if (!v || typeof v !== "object" || depth > 4) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, REDACT.test(k) ? "[redacted]" : clean(x, depth + 1)]));
};

const write = (level: "info" | "warn" | "error") => (msg: string, fields: Record<string, unknown> = {}) =>
  console[level === "info" ? "log" : level](JSON.stringify({ ts: new Date().toISOString(), level, msg, ...(clean(fields) as object) }));

export const log = { info: write("info"), warn: write("warn"), error: write("error") };
