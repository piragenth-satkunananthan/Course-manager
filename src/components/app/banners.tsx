// Banners under the page header (design-system §6.10): an icon, one sentence, and at most one action. At most two,
// most severe first. WhatsApp, AI and paused banners join with #11, #12 and #15.
import { TriangleAlert } from "lucide-react";
import type { Banner } from "@/shared/schemas/dashboard";

const TEXT: Partial<Record<Banner["kind"], string>> = {
  worker_unhealthy: "Reminders may be delayed. We've been alerted.",
};

export function Banners({ banners }: { banners: Banner[] }) {
  const shown = banners.filter((b) => TEXT[b.kind]).slice(0, 2);
  if (!shown.length) return null;
  return (
    <div className="mb-4 space-y-2">
      {shown.map((b) => (
        <p key={b.kind} role="status" className="flex items-start gap-2 rounded-md bg-warning-subtle p-3 text-sm font-medium text-warning">
          <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          {TEXT[b.kind]}
        </p>
      ))}
    </div>
  );
}
