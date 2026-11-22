// The request poller (design file 58a): the web app writes *_requested_at on wa_session; every 2 seconds the worker
// acts on any newer than the last one it handled. This is the only channel from the web app to the worker.
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { waSession } from "@/server/db/schema";
import { log } from "@/server/log";
import type { Ingest } from "./whatsapp/ingest";
import type { WhatsAppLink } from "./whatsapp/link";

type Handled = { pairing: number; unlink: number; groups: number };
const t = (d: Date | null) => (d ? +d : 0);

export async function startPoller(studentId: string, link: WhatsAppLink, ingest: Ingest, intervalMs = 2_000) {
  const read = async () => (await db.select().from(waSession).where(eq(waSession.studentId, studentId)))[0];
  const first = await read();
  // Requests made before this start were handled by an earlier worker, except: a pairing it never finished (below),
  // and an unlink asked for while the worker was down, which still has a link to remove (account deletion relies on it).
  const unlinkPending = !!first && first.status !== "unlinked" && t(first.unlinkRequestedAt) > t(first.lastConnectedAt);
  const handled: Handled = { pairing: t(first?.pairingRequestedAt ?? null), unlink: unlinkPending ? 0 : t(first?.unlinkRequestedAt ?? null), groups: t(first?.groupsReloadRequestedAt ?? null) };
  if (first?.status === "pairing") {
    await db.update(waSession).set({ status: "error", pairingCode: null, lastError: "Pairing was interrupted; try again." }).where(eq(waSession.studentId, studentId));
  }

  let seen = !!first;
  const poll = async () => {
    const s = await read();
    // The row went with the account (deleted, file 48): log WhatsApp out even if the 10-second wait ran out.
    if (!s) {
      if (seen) await link.unlink().catch((e) => log.error("unlink after account deletion failed", { error: e }));
      seen = false;
      return;
    }
    seen = true;
    if (t(s.unlinkRequestedAt) > handled.unlink) {
      handled.unlink = t(s.unlinkRequestedAt);
      await link.unlink();
    }
    if (t(s.pairingRequestedAt) > handled.pairing && s.pairingPhone) {
      handled.pairing = t(s.pairingRequestedAt);
      await link.startPairing(s.pairingPhone);
    }
    if (t(s.groupsReloadRequestedAt) > handled.groups) {
      handled.groups = t(s.groupsReloadRequestedAt);
      await ingest.reloadGroups();
    }
  };
  let running = false;
  return setInterval(() => {
    if (running) return; // never overlap: pairing can take a moment
    running = true;
    poll()
      .catch((e) => log.error("request poller failed", { error: e }))
      .finally(() => (running = false));
  }, intervalMs);
}
