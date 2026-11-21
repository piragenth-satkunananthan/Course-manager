// The AI evaluation gate (design file 67, §13): the real context builder, prompt, NIM client and validator on
// labelled cases. Run by hand on every model, prompt or schema change; exits 1 below the bar
// (100% on deadline cases, at least 95% overall).
//   NIM_API_KEY=… NIM_MODEL=… npm run ai-eval                         synthetic cases + $AI_EVAL_DIR/heldout
//   npm run ai-eval -- --set tuning                                    $AI_EVAL_DIR/tuning only, while tuning the prompt
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type AiContext, buildContext } from "../src/server/ai/context";
import { validateOutput } from "../src/server/ai/validate";
import { nimClient } from "../src/worker/ai/nim-client";
import { PROMPT_VERSION, repairPrompt, SYSTEM_PROMPT, userPrompt } from "../src/worker/ai/prompt";
import { type EvalCase, gradeCase, summarise } from "./lib/score";

const { values } = parseArgs({ options: { set: { type: "string" } } });
const evalDir = process.env.AI_EVAL_DIR;
const dirs =
  values.set === "tuning"
    ? [join(evalDir ?? "", "tuning")]
    : ["tests/ai-eval/synthetic", ...(evalDir ? [join(evalDir, "heldout")] : [])];
const cases: EvalCase[] = dirs.flatMap((d) =>
  existsSync(d) ? readdirSync(d).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(d, f), "utf8")) as EvalCase) : [],
);
if (!cases.length) throw new Error(`no cases in ${dirs.join(", ")}`);
const ai = nimClient();
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
      messages: c.thread.map((m) => ({ id: m.id, sender: m.senderName, sentAt: new Date(m.sentAt).toISOString(), kind: m.kind === "edit" ? "edit" : "text", text: m.text, editOf: null })),
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
}
const s = summarise(grades);
console.log(JSON.stringify(s, null, 2));
if (!s.go) process.exit(1);
