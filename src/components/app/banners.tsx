// Banners under the page header (design-system §6.10): an icon, one sentence, and at most one action. At most two,
// most severe first. WhatsApp, AI and paused banners join with #11, #12 and #15.
import { TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { instantToLocal } from "@/server/domain/time";
import type { Banner } from "@/shared/schemas/dashboard";

const TEXT: Partial<Record<Banner["kind"], (b: Banner) => string>> = {
  whatsapp_disconnected: (b) => `WhatsApp disconnected${b.since ? ` since ${instantToLocal(new Date(b.since)).time}` : ""}. New announcements aren't being read.`,
  worker_unhealthy: () => "Reminders may be delayed. We've been alerted.",
};

export function Banners({ banners }: { banners: Banner[] }) {
  const shown = banners.filter((b) => TEXT[b.kind]).slice(0, 2);
  if (!shown.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {shown.map((b) => (
        <div key={b.kind} role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-subtle p-3 text-sm font-medium text-warning">
          {b.kind === "whatsapp_disconnected" ? (
            <WifiOff size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          ) : (
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          )}
          <span className="min-w-0 flex-1">{TEXT[b.kind]!(b)}</span>
          {b.kind === "whatsapp_disconnected" && (
            <Link href="/settings#whatsapp" className="inline-flex min-h-11 items-center font-semibold underline md:min-h-10">Re-link</Link>
          )}
        </div>
      ))}
    </div>
  );
}
