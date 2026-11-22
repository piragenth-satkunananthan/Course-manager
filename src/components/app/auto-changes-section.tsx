"use client";
// Settings → Auto Changes (#15): the switch that pauses them. Off means paused: messages keep queuing, nothing is changed.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { Settings } from "@/shared/schemas/settings";

/** Pauses or resumes Auto Changes, then refreshes the page so the banner follows. */
export function useSetPaused() {
  const router = useRouter();
  return async (paused: boolean) => {
    const res = await apiFetch("/settings", { method: "PATCH", body: { autoChangesPaused: paused }, schema: Settings });
    if (!res.ok) return (toastApiError(res.error), false);
    toast.success(paused ? "Auto Changes paused" : "Auto Changes resumed");
    router.refresh();
    return true;
  };
}

export function AutoChangesSection({ paused }: { paused: boolean }) {
  const setPaused = useSetPaused();
  const [on, setOn] = useState(!paused);
  const [pending, setPending] = useState(false);
  async function change(next: boolean) {
    setPending(true);
    if (await setPaused(!next)) setOn(next);
    setPending(false);
  }
  return (
    <section aria-labelledby="auto-changes-heading" className="rounded-md border border-border bg-card p-4 md:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="auto-changes-heading" className="text-title font-semibold">
          <label htmlFor="auto-changes">Auto Changes</label>
        </h2>
        <Switch id="auto-changes" checked={on} onCheckedChange={change} disabled={pending} aria-describedby="auto-changes-help" />
      </div>
      <p id="auto-changes-help" className="mt-2 text-sm text-muted-foreground">
        {on
          ? "On: the AI applies changes from your WhatsApp groups, each with Undo."
          : "Paused: messages keep arriving and wait. Nothing is changed until you turn this back on."}
      </p>
    </section>
  );
}

/** The paused banner's action (design-system §6.10). */
export function ResumeButton() {
  const setPaused = useSetPaused();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => (setPending(true), await setPaused(false), setPending(false))}
      className="inline-flex min-h-11 items-center font-semibold underline md:min-h-10"
    >
      Resume
    </button>
  );
}
