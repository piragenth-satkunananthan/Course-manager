// Seam: the worker's AI loop against a fake NVIDIA NIM over HTTP and a real Postgres (#15): a refused key or a
// missing model stops only the AI loop, records it, and alerts; it starts again once NIM is fixed.
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadKey } from "@/server/crypto";
import { pool } from "@/server/db/client";
import { startAiLoop } from "../../src/worker/ai/loop";
import { tick } from "../../src/worker/scheduler/tick";
import { checkModel, nimClient } from "../../src/worker/ai/nim-client";
import { resetData, seedStudent } from "./api";

const MODEL = "nvidia/test-model";
let models = [MODEL];
let chatStatus = 200;
let chats = 0;
let lastModel = "";
let server: Server;
let base: string;
let loop: { stop(): void } | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/models") return void res.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
      chats++;
      lastModel = JSON.parse(body || "{}").model ?? "";
      const ids = [...body.matchAll(/\\"id\\":\\"([0-9a-f-]{36})\\"/g)].map((m) => m[1]);
      if (chatStatus !== 200) return void res.writeHead(chatStatus).end("{}");
      const content = JSON.stringify({ messages: ids.map((id) => ({ id, decision: "ignored", reason: "t" })), operations: [], unknownCourses: [] });
      res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));
afterEach(() => loop?.stop());

let studentId: string;
beforeEach(async () => {
  models = [MODEL];
  chatStatus = 200;
  chats = 0;
  await resetData();
  await pool.query("truncate health_signal");
  studentId = (await seedStudent("student@example.com")).id;
});

const start = () => (loop = startAiLoop({ key: loadKey(randomBytes(32).toString("base64")), client: () => nimClient(MODEL, "k", base), check: () => checkModel(MODEL, "k", base), tickMs: 30, recheckMs: 150 }));
const signal = async () => (await pool.query("select last_ok_at, last_error_at, detail from health_signal where component = 'ai'")).rows[0];
const alerts = async () => (await pool.query("select payload->>'cause' as cause from activity_event where kind = 'alert'")).rows.map((r) => r.cause);
/** A message that has been quiet long enough to be batched. */
async function queued() {
  const group = (await pool.query("insert into wa_group (student_id, wa_jid, subject) values ($1, 'g@g.us', 'G') returning id", [studentId])).rows[0].id;
  await pool.query("insert into inbox_message (student_id, wa_group_id, wa_message_id, kind, sent_at, received_at) values ($1, $2, 'm1', 'text', now(), now() - interval '5 minutes')", [studentId, group]);
}
const until = async (check: () => Promise<boolean>) => expect.poll(check, { timeout: 3000, interval: 25 }).toBe(true);

describe("the AI loop (#15)", () => {
  it("a refused key stops only the AI loop: recorded, alerted once, no more calls; it restarts once the key works", async () => {
    await queued();
    chatStatus = 401;
    start();
    await until(async () => (await alerts()).includes("ai_auth"));
    expect(await signal()).toMatchObject({ detail: "NIM refused the key (401)" });
    expect((await pool.query("select status, attempts from inbox_message")).rows).toEqual([{ status: "pending", attempts: 0 }]);
    const calls = chats;
    await new Promise((r) => setTimeout(r, 100)); // shorter than the recheck: stopped
    expect(chats).toBe(calls);
    // The scheduler (reminders) is its own loop and keeps running.
    await tick(new Date());
    expect((await pool.query("select last_ok_at is not null as ok from health_signal where component = 'scheduler'")).rows).toEqual([{ ok: true }]);

    chatStatus = 200;
    await until(async () => (await pool.query("select status from inbox_message")).rows[0].status === "done");
    const s = await signal();
    expect(+s.last_ok_at).toBeGreaterThan(+s.last_error_at);
    expect(await alerts()).toEqual(["ai_auth"]); // the same cause at most once every 12 hours
  });

  it("a pinned model NIM no longer lists stops the loop at startup and alerts; so does a 404 mid-run", async () => {
    models = ["nvidia/other"];
    start();
    await until(async () => (await alerts()).includes("ai_auth"));
    expect((await signal()).detail).toBe(`NIM_MODEL ${MODEL} isn't listed by NIM`);
    loop!.stop();

    await pool.query("truncate activity_event");
    models = [MODEL];
    chatStatus = 404;
    await queued();
    start();
    await until(async () => (await alerts()).includes("ai_auth"));
    expect((await signal()).detail).toBe("NIM doesn't offer the pinned model (404)");
    expect((await pool.query("select status, possibly_missed from inbox_message")).rows).toEqual([{ status: "pending", possibly_missed: false }]);
  });

  it("NIM unreachable at startup is recorded and retried, without an alert", async () => {
    const dead = "http://127.0.0.1:9";
    loop = startAiLoop({ key: loadKey(randomBytes(32).toString("base64")), client: () => nimClient(MODEL, "k", dead), check: () => checkModel(MODEL, "k", dead), tickMs: 30, recheckMs: 10_000 });
    await until(async () => !!(await signal())?.last_error_at);
    expect(await alerts()).toEqual([]);
  });

  it("picks up a new model on its next batch, without a restart (#81)", async () => {
    let model = MODEL;
    loop = startAiLoop({ key: loadKey(randomBytes(32).toString("base64")), client: () => nimClient(model, "k", base), check: () => checkModel(MODEL, "k", base), tickMs: 30, recheckMs: 150 });
    await queued();
    await until(async () => chats > 0);
    expect(lastModel).toBe(MODEL);
    model = "nvidia/new-model";
    models = [MODEL, model];
    await pool.query("insert into inbox_message (student_id, wa_group_id, wa_message_id, kind, sent_at, received_at) select student_id, wa_group_id, 'm2', 'text', now(), now() - interval '5 minutes' from inbox_message limit 1");
    await until(async () => lastModel === "nvidia/new-model");
  });
});

