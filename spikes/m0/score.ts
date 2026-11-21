// Grades one model output against a labelled case, and summarises a run against the M0 pass bar.
import * as z from "zod";
import { opsV1 } from "./ops-v1.ts";

export type EvalCase = {
  id: string;
  category: string;
  now: string;
  fixture: Record<string, unknown>;
  thread: { id: string; senderName: string; sentAt: string; kind: "original" | "edit" | "revoke"; text: string; editOf?: string }[];
  expected: { operations: unknown[]; decisions: Record<string, string> };
};

export type Grade = {
  id: string;
  pass: boolean;
  deadline: boolean;
  schemaError?: string;
  missing: unknown[];
  extra: unknown[];
  decisionErrors: { id: string; expected: string; actual: string | undefined }[];
  missedDeadlineOps: number;
};

// shortcut: wording-only fields are not compared; upgrade to a fuzzy match if M0 shows wrong titles slipping through.
const FREE_TEXT = new Set(["title", "description", "submitWhere", "topics", "kindLabel"]);
const LOOSE = new Set(["location", "newLocation"]); // compared ignoring case and spacing
const isDeadlineOp = (o: any) => /_(assignment|exam)$/.test(o?.op ?? "");

function canon(v: any, key = ""): any {
  if (Array.isArray(v)) return key === "sourceMessageIds" ? [...v].sort() : v.map((x) => canon(x));
  if (v && typeof v === "object")
    return Object.fromEntries(Object.keys(v).filter((k) => !FREE_TEXT.has(k)).sort().map((k) => [k, canon(v[k], k)]));
  return LOOSE.has(key) && typeof v === "string" ? v.toLowerCase().replace(/\s+/g, " ").trim() : v;
}

// Multiset difference on canonical JSON.
function minus(a: unknown[], b: unknown[]): unknown[] {
  const pool = b.map((x) => JSON.stringify(canon(x)));
  return a.filter((x) => {
    const i = pool.indexOf(JSON.stringify(canon(x)));
    if (i === -1) return true;
    pool.splice(i, 1);
    return false;
  });
}

export function parseOutput(raw: string) {
  const json = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { error: `not JSON: ${(e as Error).message}` } as const;
  }
  const r = opsV1.safeParse(data);
  return r.success ? ({ data: r.data } as const) : ({ error: z.prettifyError(r.error) } as const);
}

export function gradeCase(c: EvalCase, raw: string): Grade {
  const expected = c.expected.operations;
  const parsed = parseOutput(raw);
  // Deadline-affecting: a deadline op was expected, or the model produced one (an invented or wrong cancel counts too).
  const deadline = expected.some(isDeadlineOp) || !!parsed.data?.operations.some(isDeadlineOp);
  if ("error" in parsed)
    return { id: c.id, pass: false, deadline, schemaError: parsed.error, missing: expected, extra: [], decisionErrors: [], missedDeadlineOps: expected.filter(isDeadlineOp).length };

  const actual = parsed.data.operations;
  const missing = minus(expected, actual);
  const extra = minus(actual, expected);
  const got = new Map(parsed.data.messages.map((m) => [m.id, m.decision as string]));
  const decisionErrors = Object.entries(c.expected.decisions)
    .filter(([id, d]) => got.get(id) !== d)
    .map(([id, d]) => ({ id, expected: d, actual: got.get(id) }));
  return {
    id: c.id,
    pass: !missing.length && !extra.length && !decisionErrors.length,
    deadline,
    missing,
    extra,
    decisionErrors,
    missedDeadlineOps: missing.filter(isDeadlineOp).length,
  };
}

export function summarise(grades: Grade[]) {
  const rate = (gs: Grade[]) => (gs.length ? gs.filter((g) => g.pass).length / gs.length : null);
  const deadlineScore = rate(grades.filter((g) => g.deadline));
  const overallScore = rate(grades);
  return {
    cases: grades.length,
    deadlineCases: grades.filter((g) => g.deadline).length,
    deadlineScore,
    overallScore,
    missedDeadlineOps: grades.reduce((n, g) => n + g.missedDeadlineOps, 0),
    wrongOrExtraOps: grades.reduce((n, g) => n + g.extra.length, 0),
    schemaFailures: grades.filter((g) => g.schemaError).length,
    // M0 bar: 100% on deadline cases and at least 95% overall.
    go: deadlineScore === 1 && overallScore !== null && overallScore >= 0.95,
  };
}
