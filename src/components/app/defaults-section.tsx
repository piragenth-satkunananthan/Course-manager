"use client";
// Settings → Defaults (U47, #83): the due time for a new Assignment announced with none, the first day of the week,
// and 12- or 24-hour times. Existing Assignments keep their times.
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-fetch";
import { formatTime } from "@/lib/format";
import type { DefaultsSettings } from "@/shared/schemas/settings";

const NO_TIME = "23:59";
const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

function Choice({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DefaultsSection({ initial }: { initial: DefaultsSettings }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const res = await apiFetch("/settings", { method: "PATCH", body: { defaults: d } });
    setBusy(false);
    if (!res.ok) return toast.error(res.error.message);
    toast.success("Defaults saved");
    router.refresh();
  }
  return (
    <section id="defaults" aria-labelledby="defaults-heading" className="scroll-mt-4 rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="defaults-heading" className="text-title font-semibold">Defaults</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Choice
          label="Due time when none is given"
          value={d.dueTime}
          onChange={(dueTime) => setD({ ...d, dueTime })}
          options={[{ value: NO_TIME, label: "None (counts as 23:59)" }, ...TIMES.map((t) => ({ value: t, label: formatTime(t, d.timeFormat) }))]}
        />
        <Choice label="Week starts on" value={d.weekStart} onChange={(v) => setD({ ...d, weekStart: v as DefaultsSettings["weekStart"] })} options={[{ value: "monday", label: "Monday" }, { value: "sunday", label: "Sunday" }]} />
        <Choice label="Time format" value={d.timeFormat} onChange={(v) => setD({ ...d, timeFormat: v as DefaultsSettings["timeFormat"] })} options={[{ value: "24h", label: "24-hour (14:00)" }, { value: "12h", label: "12-hour (2:00 pm)" }]} />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">The due time applies to new Assignments only, from the AI or added by hand; ones you already have keep theirs. Date pickers follow your browser.</p>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={busy} className="max-md:w-full">Save defaults</Button>
      </div>
    </section>
  );
}
