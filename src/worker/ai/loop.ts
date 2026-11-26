// The AI loop (design §8): a startup check (the key works and NIM lists the pinned model), then a tick every minute.
// A fatal answer (key refused, model gone) stops only this loop: it records the error, alerts, and checks again every
// 5 minutes, while messages keep queuing and the other loops run on. Each tick that runs records the AI as up.
import { recordHealth } from "@/server/data/health";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { log } from "@/server/log";
import { raiseAlert } from "../scheduler/alerts";
import { aiTick } from "./batcher";
import { AiFatalError, type AiClient } from "./nim-client";

// `client` is called on every tick, so a key or model changed in Settings applies on the next batch (#81).
type Deps = { key: Buffer; client: () => AiClient | Promise<AiClient>; check: () => Promise<void>; tickMs?: number; recheckMs?: number };

const record = (ok: boolean, detail: string | null) => recordHealth("ai", ok, detail);

/** Starts the loop; `stop` ends it (tests, shutdown). */
export function startAiLoop({ key, client, check, tickMs = 60_000, recheckMs = 5 * 60_000 }: Deps) {
  let timer: NodeJS.Timeout | null = null;
  let recheck: NodeJS.Timeout | null = null;
  let stopped = false;

  async function fail(e: Error) {
    if (timer) clearInterval(timer);
    timer = null;
    const fatal = e instanceof AiFatalError;
    log.error("ai loop stopped; checking again later", { error: e.message, recheckMinutes: recheckMs / 60_000 });
    await record(false, e.message).catch(() => {});
    // A refused key or a missing model needs the Student; a network blip at startup is left to the capture heartbeat.
    const students = await db.select({ id: user.id }).from(user).catch(() => []);
    if (fatal && students.length === 1) await raiseAlert(students[0]!.id, "ai_auth", { error: e.message }, new Date()).catch(() => {});
    if (!stopped) recheck = setTimeout(() => void start(), recheckMs);
  }

  async function start() {
    if (stopped) return;
    try {
      await check();
      const first = await client();
      await record(true, null);
      log.info("ai loop started", { model: first.model });
      let running = false;
      timer = setInterval(() => {
        if (running) return; // a slow batch never overlaps the next tick
        running = true;
        Promise.resolve(client())
          .then((ai) => aiTick(ai, key))
          .then(() => record(true, null))
          .catch((e: Error) => (e instanceof AiFatalError ? fail(e) : log.error("ai tick failed", { error: e.message })))
          .finally(() => (running = false));
      }, tickMs);
    } catch (e) {
      await fail(e as Error);
    }
  }

  void start();
  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (recheck) clearTimeout(recheck);
    },
  };
}
