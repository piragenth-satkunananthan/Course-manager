"use client";
// Pausing Auto Changes (#15): the switch in Settings → WhatsApp (design-system §7.6) and the paused banner's Resume
// (§6.10). Off means paused: messages keep queuing and nothing is changed.
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { Settings } from "@/shared/schemas/settings";

/** Saves the pause, then refreshes the page so the banner and the switch follow the server. */
function useSetPaused() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const set = (paused: boolean, before?: () => void) =>
    startTransition(async () => {
      before?.();
      const res = await apiFetch("/settings", { method: "PATCH", body: { autoChangesPaused: paused }, schema: Settings });
      if (!res.ok) {
        toastApiError(res.error);
        return;
      }
      toast.success(paused ? "Auto Changes paused" : "Auto Changes resumed");
      router.refresh();
    });
  return [set, pending] as const;
}

export function AutoChangesSwitch({ paused }: { paused: boolean }) {
  const [set, pending] = useSetPaused();
  // Shows the new position while saving; afterwards it follows `paused` from the server (so a Resume elsewhere shows).
  const [on, setOn] = useOptimistic(!paused);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="auto-changes" className="font-semibold">Auto Changes</label>
        <Switch id="auto-changes" checked={on} onCheckedChange={(next) => set(!next, () => setOn(next))} disabled={pending} aria-describedby="auto-changes-help" />
      </div>
      <p id="auto-changes-help" className="mt-1 text-sm text-muted-foreground">
        {on ? "On: the AI applies changes from your linked groups, each with Undo." : "Paused: messages keep arriving and wait. Nothing is changed until you turn this back on."}
      </p>
    </div>
  );
}

export function ResumeButton() {
  const [set, pending] = useSetPaused();
  return (
    <button type="button" disabled={pending} onClick={() => set(false)} className="inline-flex min-h-11 items-center font-semibold underline md:min-h-10">
      Resume
    </button>
  );
}
