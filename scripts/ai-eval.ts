// The AI evaluation gate (design file 67, §13): the real context builder, prompt, NIM client and validator on
// labelled cases. Run by hand on every model, prompt or schema change; exits 1 below the bar
// (100% on deadline cases, at least 95% overall).
//   NIM_API_KEY=… NIM_MODEL=… npm run ai-eval                         synthetic cases + $AI_EVAL_DIR/heldout
//   npm run ai-eval -- --set tuning                                    $AI_EVAL_DIR/tuning only, while tuning the prompt
//   npm run ai-eval -- --models                                        the models NIM_API_KEY can use
//   npm run ai-eval -- --details                                       why each synthetic case failed
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type AiContext, buildContext } from "../src/server/ai/context";
import { validateOutput } from "../src/server/ai/validate";
import { AiRetryableError, checkModel, nimClient } from "../src/worker/ai/nim-client";
import { PROMPT_VERSION, repairPrompt, SYSTEM_PROMPT, userPrompt } from "../src/worker/ai/prompt";
import { type EvalCase, gradeCase, summarise } from "./lib/score";

if (existsSync(".env")) process.loadEnvFile(".env"); // the same NIM_API_KEY and NIM_MODEL the worker uses
if (process.argv.includes("--models")) {
  const res = await fetch(`${process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1"}/models`, { headers: { authorization: `Bearer ${process.env.NIM_API_KEY}` } });
  console.log(((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id).sort().join("\n"));
  process.exit(0);
}
try {
  await checkModel();
} catch (e) {
  console.error(`Can't run the evaluation: ${(e as Error).message}.`);
  console.error("Set NIM_API_KEY and NIM_MODEL (in .env or the environment). List the models your key can use with: npm run ai-eval -- --models");
  process.exit(2);
}
const { values } = parseArgs({ options: { set: { type: "string" }, models: { type: "boolean" }, details: { type: "boolean" } } });
const evalDir = process.env.AI_EVAL_DIR;
if (values.details && process.env.AI_EVAL_DIR) throw new Error("--details prints message text: run it without AI_EVAL_DIR");
const dirs =
  values.set === "tuning"
    ? [join(evalDir ?? "", "tuning")]
    : ["tests/ai-eval/synthetic", ...(evalDir ? [join(evalDir, "heldout")] : [])];
const cases: EvalCase[] = dirs.flatMap((d) =>
  existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(d, f), "utf8")) as EvalCase) : [],
);
if (!cases.length) throw new Error(`no cases in ${dirs.join(", ")}`);
const nim = nimClient();
// NIM's free tier often times out or answers 429/5xx; retry those so one blip doesn't end the run.
const ai = {
  ...nim,
  async complete(chat: Parameters<typeof nim.complete>[0]) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await nim.complete(chat);
      } catch (e) {
        if (!(e instanceof AiRetryableError) || attempt === 4) throw e;
        console.warn(`  retrying after ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, attempt * 15_000));
      }
    }
  },
};
console.log(`${cases.length} cases, model ${ai.model}, prompt ${PROMPT_VERSION}`);

const grades = [];
for (const c of cases) {
  const f = c.fixture as Omit<AiContext, "now" | "timeZone" | "messages">;
  const ctx = await buildContext(
    {
      getSemester: async () => f.semester,
      getCourses: async () => f.courses,
      getOpenAndRecentAssessments: async () => ({ assignments: f.assignments ?? [], exams: f.exams ?? [] }),
      getSuppressions: async () => f.suppressions ?? [],
      getRecentMessages: async () => f.recentMessages ?? [],
    },
    {
      now: new Date(c.now),
      linkedTo: f.linkedTo,
      // An edit's original is in the thread or, already processed, in recentMessages (as after the worker's system Undo).
      messages: c.thread.map((m) => {
        const original = m.editOf ? [...c.thread, ...(f.recentMessages ?? [])].find((o) => o.id === m.editOf) : undefined;
        return { id: m.id, sender: m.senderName, sentAt: new Date(m.sentAt).toISOString(), kind: m.kind === "edit" ? "edit" : "text", text: m.text, editOf: original ? { id: original.id, text: original.text } : null };
      }),
    },
  );
  const chat = [{ role: "system" as const, content: SYSTEM_PROMPT }, { role: "user" as const, content: userPrompt(ctx) }];
  const first = (await ai.complete(chat)).content;
  let r = validateOutput(first, ctx);
  if (!r.ok) r = validateOutput((await ai.complete([...chat, { role: "assistant", content: first }, { role: "user", content: repairPrompt(r.error) }])).content, ctx);
  // Graded on what the app would apply: the validated operations.
  const applied = r.ok
    ? JSON.stringify({ messages: [...r.decisions].map(([id, d]) => ({ id, ...d })), operations: r.valid, unknownCourses: r.unknownCourses })
    : "invalid";
  const g = gradeCase(c, applied);
  grades.push(g);
  console.log(`${g.pass ? "PASS" : "FAIL"} ${g.deadline ? "[deadline] " : ""}${c.id}${g.schemaError ? " (invalid output)" : ""}`);
  // Details print only for the committed synthetic cases: held-out cases hold real messages.
  if (!g.pass && values.details)
    console.log(JSON.stringify({ schemaError: g.schemaError?.slice(0, 300), missing: g.missing, extra: g.extra, decisions: g.decisionErrors, dropped: r.ok ? r.dropped.map((d) => d.reason) : undefined }));
}
const s = summarise(grades);
console.log(JSON.stringify(s, null, 2));
if (!s.go) process.exit(1);
