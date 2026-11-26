"use client";
// Settings → Dashboard (U47, #84): how many days Due soon covers, and the sections' order and which are shown.
// Overdue can be moved but not hidden.
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-fetch";
import { DASHBOARD_SECTION_IDS, type DashboardSettings } from "@/shared/schemas/settings";

type Id = (typeof DASHBOARD_SECTION_IDS)[number];
const LABELS: Record<Id, string> = { overdue: "Overdue", today: "Today", dueSoon: "Due soon", tbaExams: "Exams with date TBA", checkThese: "Check these", recent: "Recent changes" };
const DAYS = [3, 5, 7, 10, 14, 21, 30];
const DEFAULT: DashboardSettings = { dueSoonDays: 14, order: [...DASHBOARD_SECTION_IDS], hidden: [] };

export function DashboardSection({ initial }: { initial: DashboardSettings }) {
  const router = useRouter();
  const daysId = useId();
  const [days, setDays] = useState(initial.dueSoonDays);
  const [order, setOrder] = useState<Id[]>([...initial.order, ...DASHBOARD_SECTION_IDS.filter((s) => !initial.order.includes(s))]);
  const [hidden, setHidden] = useState(new Set<Id>(initial.hidden));
  const [busy, setBusy] = useState(false);
  const move = (i: number, by: -1 | 1) => setOrder((o) => {
    const next = [...o];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    return next;
  });

  async function save(d: DashboardSettings) {
    setBusy(true);
    const res = await apiFetch("/settings", { method: "PATCH", body: { dashboard: d } });
    setBusy(false);
    if (!res.ok) return toast.error(res.error.message);
    toast.success("Dashboard saved");
    router.refresh();
  }
  function reset() {
    setDays(DEFAULT.dueSoonDays);
    setOrder([...DEFAULT.order]);
    setHidden(new Set());
    void save(DEFAULT);
  }

  return (
    <section id="dashboard" aria-labelledby="dashboard-heading" className="scroll-mt-4 rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="dashboard-heading" className="text-title font-semibold">Dashboard</h2>
      <div className="mt-4 space-y-2">
        <label htmlFor={daysId} className="block text-sm font-medium">
          Due soon covers
        </label>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger id={daysId} className="w-full md:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS.map((n) => (
              <SelectItem key={n} value={String(n)}>{`The next ${n} days`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="mt-6">
        <legend className="font-semibold">Sections, in order</legend>
        <ol className="mt-2 space-y-2">
          {order.map((s, i) => (
            <li key={s} className="flex items-center gap-2 rounded-md border border-border p-2">
              <label className="flex min-h-11 flex-1 items-center gap-3 md:min-h-10">
                <Checkbox
                  checked={!hidden.has(s)}
                  disabled={s === "overdue"}
                  onCheckedChange={(v) => setHidden((h) => {
                    const next = new Set(h);
                    if (v === true) next.delete(s);
                    else next.add(s);
                    return next;
                  })}
                />
                <span className="text-sm">
                  {LABELS[s]}
                  {s === "overdue" && <span className="text-muted-foreground"> (always shown)</span>}
                </span>
              </label>
              <Button type="button" variant="outline" size="icon" aria-label={`Move ${LABELS[s]} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={20} strokeWidth={1.75} aria-hidden="true" />
              </Button>
              <Button type="button" variant="outline" size="icon" aria-label={`Move ${LABELS[s]} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={20} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      </fieldset>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={reset} disabled={busy} className="max-md:w-full">
          <RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />
          Reset to default
        </Button>
        <Button type="button" onClick={() => save({ dueSoonDays: days, order, hidden: [...hidden] })} disabled={busy} className="max-md:w-full">
          Save dashboard
        </Button>
      </div>
    </section>
  );
}
