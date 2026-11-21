// Seam: the worker's request poller against a real Postgres, with a fake WhatsApp Link (#11).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@/server/db/client";
import { startPoller } from "../../src/worker/poller";
import type { Ingest } from "../../src/worker/whatsapp/ingest";
import type { WhatsAppLink } from "../../src/worker/whatsapp/link";
import { resetData, seedStudent } from "./api";

let studentId: string;
let calls: string[];
let timer: NodeJS.Timeout | undefined;
const link = { unlink: async () => void calls.push("unlink"), startPairing: async (p: string) => void calls.push(`pair ${p}`) } as unknown as WhatsAppLink;
const ingest = { reloadGroups: async () => void calls.push("reload") } as unknown as Ingest;
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
};

beforeEach(async () => {
  calls = [];
  await resetData();
  studentId = (await seedStudent("a@example.com")).id;
  await pool.query("insert into wa_session (student_id) values ($1) on conflict do nothing", [studentId]);
});
afterEach(() => clearInterval(timer));

describe("the request poller", () => {
  it("acts on new pairing, group and unlink requests", async () => {
    timer = await startPoller(studentId, link, ingest, 20);
    await pool.query("update wa_session set pairing_phone = '94771234567', pairing_requested_at = now(), groups_reload_requested_at = now() where student_id = $1", [studentId]);
    await until(() => calls.length >= 2);
    await pool.query("update wa_session set unlink_requested_at = now() where student_id = $1", [studentId]);
    await until(() => calls.includes("unlink"));
    expect(calls).toEqual(["pair 94771234567", "reload", "unlink"]);
  });

  it("still unlinks when the request came while the worker was down, but doesn't replay older requests", async () => {
    await pool.query(
      "update wa_session set status = 'connected', last_connected_at = now() - interval '1 hour', unlink_requested_at = now(), groups_reload_requested_at = now() - interval '2 hours' where student_id = $1",
      [studentId],
    );
    timer = await startPoller(studentId, link, ingest, 20);
    await until(() => calls.length > 0);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toEqual(["unlink"]);
  });

  it("turns a pairing interrupted by a restart into a readable error", async () => {
    await pool.query("update wa_session set status = 'pairing', pairing_requested_at = now() where student_id = $1", [studentId]);
    timer = await startPoller(studentId, link, ingest, 20);
    expect((await pool.query("select status, last_error from wa_session where student_id = $1", [studentId])).rows[0]).toEqual({ status: "error", last_error: "Pairing was interrupted; try again." });
  });
});
