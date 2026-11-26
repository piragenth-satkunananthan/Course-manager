// Seam: the Settings AI section (#80): its status from the real health signal, queue and batches, and
// POST /ai/test against a fake NVIDIA NIM over HTTP.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as aiTest from "@/app/api/v1/ai/test/route";
import { pool } from "@/server/db/client";
import { getAiStatus } from "@/server/data/ai-status";
import { recordHealth } from "@/server/data/health";
import { client, resetData, seedStudent } from "./api";

let reply: "ok" | "busy" | "slow" = "ok";
let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume().on("end", () => {
      if (reply === "busy") return void res.writeHead(429).end("{}");
      const send = () => res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
      if (reply === "slow") return void setTimeout(send, 400);
      send();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { NIM_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, NIM_API_KEY: "k", NIM_MODEL: "nvidia/test-model", NIM_TEST_TIMEOUT_MS: "200" });
});
afterAll(() => new Promise((r) => server.close(r)));

let a: ReturnType<typeof client>;
let studentId: string;
beforeEach(async () => {
  reply = "ok";
  await resetData();
  await pool.query("truncate health_signal");
  const me = await seedStudent(`s${Date.now()}@example.com`);
  studentId = me.id;
  a = client(me.cookie);
});

describe("AI status (#80)", () => {
  it("is working when the loop is up, and stopped with a plain reason after a refused key", async () => {
    await recordHealth("ai", true);
    expect((await getAiStatus(studentId))).toEqual({ state: "working", lastSuccessAt: null, waiting: 0, problem: null, lastError: null, model: "nvidia/test-model" });
    await recordHealth("ai", false, "NIM refused the key (401)");
    expect((await getAiStatus(studentId))).toMatchObject({ state: "stopped", problem: "NVIDIA refused the API key" });
  });

  it("is paused when Auto Changes are off", async () => {
    await recordHealth("ai", true);
    await pool.query(`update "user" set auto_changes_paused = true where id = $1`, [studentId]);
    expect((await getAiStatus(studentId))).toMatchObject({ state: "paused" });
  });
});

describe("Test AI now (#80)", () => {
  it("answers with the time taken; a busy or slow NIM gives a plain error; at most once every 10 seconds", async () => {
    const ok = await a(aiTest.POST, "POST", "/ai/test");
    expect(ok).toMatchObject({ status: 200, json: { ok: true, ms: expect.any(Number), model: "nvidia/test-model" } });
    expect((await a(aiTest.POST, "POST", "/ai/test")).status).toBe(429);

    const other = client((await seedStudent(`t${Date.now()}@example.com`)).cookie);
    reply = "busy";
    expect((await other(aiTest.POST, "POST", "/ai/test")).json).toMatchObject({ ok: false, problem: "NVIDIA is busy (too many requests)" });
  });

  it("gives up after its short time limit", async () => {
    reply = "slow";
    expect((await a(aiTest.POST, "POST", "/ai/test")).json).toMatchObject({ ok: false, problem: "NVIDIA didn't answer in time" });
  });

  it("needs a signed-in Student", async () => {
    expect((await client("")(aiTest.POST, "POST", "/ai/test")).status).toBe(401);
  });
});
