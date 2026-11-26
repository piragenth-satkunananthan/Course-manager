// Seam: Settings → AI key and model (#81, U45) against a fake NVIDIA NIM over HTTP and a real Postgres.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as aiModels from "@/app/api/v1/ai/models/route";
import * as aiTest from "@/app/api/v1/ai/test/route";
import * as aiKey from "@/app/api/v1/settings/ai-key/route";
import * as aiModel from "@/app/api/v1/settings/ai-model/route";
import { getNimConfig } from "@/server/data/nim";
import { pool } from "@/server/db/client";
import { client, resetData, seedStudent } from "./api";

const GOOD = "nvapi-student-key-wxyz";
let seenKeys: string[] = [];
let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    const key = String(req.headers.authorization ?? "").replace("Bearer ", "");
    seenKeys.push(key);
    req.resume().on("end", () => {
      if (key !== GOOD && key !== "server-key" && !key.includes("limited")) return void res.writeHead(401).end("{}");
      if (req.url === "/models") return void res.end(JSON.stringify({ data: key.includes("limited") ? [{ id: "nvidia/server-model" }] : [{ id: "nvidia/server-model" }, { id: "nvidia/other-model" }] }));
      res.end(JSON.stringify({ choices: [{ message: { content: "OK" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { NIM_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, NIM_API_KEY: "server-key", NIM_MODEL: "nvidia/server-model" });
});
afterAll(() => new Promise((r) => server.close(r)));

let a: ReturnType<typeof client>;
let studentId: string;
beforeEach(async () => {
  seenKeys = [];
  await resetData();
  const me = await seedStudent(`k${Date.now()}@example.com`);
  studentId = me.id;
  a = client(me.cookie);
});
const save = (apiKey: string) => a(aiKey.PUT, "PUT", "/settings/ai-key", { body: { apiKey } });

describe("the AI key (#81)", () => {
  it("is checked with NVIDIA before saving; a refused key isn't saved", async () => {
    const bad = await save("nvapi-wrong");
    expect(bad).toMatchObject({ status: 400, json: { error: { fieldErrors: { apiKey: "NVIDIA refused this key" } } } });
    expect((await getNimConfig(studentId)).keySource).toBe("server");
  });

  it("is stored encrypted, shown only as ••••last4, never returned, and used from then on", async () => {
    const res = await save(GOOD);
    expect(res).toMatchObject({ status: 200, json: { keySource: "saved", keyMasked: "••••wxyz" } });
    expect(JSON.stringify(res.json)).not.toContain(GOOD);
    const row = (await pool.query(`select nim_api_key_enc from "user" where id = $1`, [studentId])).rows[0];
    expect(row.nim_api_key_enc.toString("latin1")).not.toContain(GOOD);
    expect(await getNimConfig(studentId)).toMatchObject({ apiKey: GOOD, keySource: "saved" });

    seenKeys = [];
    await a(aiTest.POST, "POST", "/ai/test");
    expect(seenKeys).toEqual([GOOD]); // Test AI now uses the saved key
  });

  it("Use the server's key removes the saved one", async () => {
    await save(GOOD);
    expect((await a(aiKey.DELETE, "DELETE", "/settings/ai-key")).json).toMatchObject({ keySource: "server", keyMasked: null }); // the server's key is never shown, even masked
    expect((await getNimConfig(studentId)).apiKey).toBe("server-key");
  });
});

describe("the AI model (#81)", () => {
  it("lists the models the key can use, switches to one, and switches back", async () => {
    expect((await a(aiModels.GET, "GET", "/ai/models")).json).toEqual({ models: ["nvidia/other-model", "nvidia/server-model"], current: "nvidia/server-model" });
    const switched = await a(aiModel.PUT, "PUT", "/settings/ai-model", { body: { model: "nvidia/other-model" } });
    expect(switched.json).toMatchObject({ model: "nvidia/other-model", previousModel: "nvidia/server-model" });
    expect((await getNimConfig(studentId)).model).toBe("nvidia/other-model");
    const back = await a(aiModel.PUT, "PUT", "/settings/ai-model", { body: { model: "nvidia/server-model" } });
    expect(back.json).toMatchObject({ model: "nvidia/server-model", previousModel: "nvidia/other-model" });
  });

  it("refuses a model the key can't use", async () => {
    expect((await a(aiModel.PUT, "PUT", "/settings/ai-model", { body: { model: "nvidia/made-up" } })).status).toBe(400);
  });
});

describe("the AI key's safety rails (#81 review)", () => {
  it("refuses characters no key has, before calling NVIDIA", async () => {
    seenKeys = [];
    expect(await save("nvapi key with spaces")).toMatchObject({ status: 400, json: { error: { fieldErrors: { apiKey: "That doesn't look like an NVIDIA key" } } } });
    expect(seenKeys).toEqual([]);
  });

  it("allows at most 5 key or model saves a minute", async () => {
    for (let i = 0; i < 5; i++) expect((await save("nvapi-wrong")).status).toBe(400);
    expect((await save(GOOD)).status).toBe(429);
  });

  it("a new key that can't use the chosen model is saved, and the model goes back to the server's (product owner)", async () => {
    await a(aiModel.PUT, "PUT", "/settings/ai-model", { body: { model: "nvidia/other-model" } });
    const limited = "nvapi-limited-1111"; // the fake NIM lists only the server's model for this key
    const res = await save(limited);
    expect(res).toMatchObject({ status: 200, json: { keySource: "saved", keyMasked: "••••1111", model: "nvidia/server-model", modelReset: "nvidia/other-model" } });
  });

  it("a saved key that can't be decrypted falls back to the server's key instead of breaking Settings", async () => {
    await save(GOOD);
    await pool.query(`update "user" set nim_api_key_enc = '\\x00' where id = $1`, [studentId]);
    expect(await getNimConfig(studentId)).toMatchObject({ apiKey: "server-key", keySource: "server" });
  });
});

