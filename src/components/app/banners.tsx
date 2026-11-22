// Banners under the page header (design-system §6.10): an icon, one sentence, and at most one action. At most two,
// most severe first.
import { CirclePause, TriangleAlert, WifiOff } from "lucide-react";
import Link from "next/link";
import { instantToLocal } from "@/server/domain/time";
import type { Banner } from "@/shared/schemas/dashboard";
import { ResumeButton } from "./auto-changes";

type Kind = Banner["kind"];
/** Each kind's sentence, icon and action (design-system §6.10). */
const BANNER: Record<Kind, { text: (b: Banner) => string; icon: typeof TriangleAlert; action?: React.ReactNode }> = {
  whatsapp_disconnected: {
    text: (b) => `WhatsApp disconnected${b.since ? ` since ${instantToLocal(new Date(b.since)).time}` : ""}. New announcements aren't being read.`,
    icon: WifiOff,
    action: <Link href="/settings#whatsapp" className="inline-flex min-h-11 items-center font-semibold underline md:min-h-10">Re-link</Link>,
  },
  worker_unhealthy: { text: () => "Reminders may be delayed. We've been alerted.", icon: TriangleAlert },
  ai_unavailable: { text: () => "Auto Changes are delayed. Messages are queued and will be processed.", icon: TriangleAlert },
  auto_changes_paused: { text: () => "Auto Changes are paused.", icon: CirclePause, action: <ResumeButton /> },
};

/** `banners` comes from getBanners: at most two, most severe first. */
export function Banners({ banners }: { banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {banners.map((b) => {
        const { text, icon: Icon, action } = BANNER[b.kind];
        return (
          <div key={b.kind} role="status" className="flex flex-wrap items-center gap-2 rounded-md bg-warning-subtle p-3 text-sm font-medium text-warning">
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">{text(b)}</span>
            {action}
          </div>
        );
      })}
    </div>
  );
}
