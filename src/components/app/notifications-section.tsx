"use client";
// Settings → Notifications (U44, #79): the Daily Digest's time and range, the Final Reminder's lead time, an optional
// second reminder, and quiet hours. Every choice starts at the original behaviour; Reset to default restores it.
import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { DEFAULT_NOTIFY as DEFAULTS } from "@/server/domain/reminders";
import { type NotifySettings, REMINDER_HOURS, SECOND_REMINDER_HOURS } from "@/shared/schemas/settings";
import { applyServerError, ErrorSummary, SaveButton, SelectField, useAppForm } from "./form";

const OFF = "off";
const pad = (n: number) => String(n).padStart(2, "0");
const halfHours = (from: number, to: number) => Array.from({ length: (to - from) * 2 + 1 }, (_, i) => `${pad(from + Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);
const ALL_DAY = Array.from({ length: 48 }, (_, i) => `${pad(Math.floor(i / 2))}:${i % 2 ? "30" : "00"}`);
const ahead = (h: number) => (h < 24 ? `${h} hour${h === 1 ? "" : "s"} before` : h === 168 ? "1 week before" : `${h / 24} day${h === 24 ? "" : "s"} before`);

// The form holds the selects' strings; the server checks the rules across fields (quiet hours and the digest).
const Form = z.object({ digestTime: z.string(), digestDays: z.string(), reminderHours: z.string(), secondReminderHours: z.string(), quietStart: z.string(), quietEnd: z.string() });
type Form = z.infer<typeof Form>;
const toForm = (n: NotifySettings): Form => ({
  digestTime: n.digestOn ? n.digestTime : OFF,
  digestDays: String(n.digestDays),
  reminderHours: String(n.reminderHours),
  secondReminderHours: n.secondReminderHours ? String(n.secondReminderHours) : OFF,
  quietStart: n.quietStart ?? OFF,
  quietEnd: n.quietEnd ?? OFF,
});
const fromForm = (f: Form, current: NotifySettings): NotifySettings => ({
  digestOn: f.digestTime !== OFF,
  digestTime: f.digestTime === OFF ? current.digestTime : f.digestTime,
  digestDays: Number(f.digestDays),
  reminderHours: Number(f.reminderHours),
  secondReminderHours: f.secondReminderHours === OFF ? null : Number(f.secondReminderHours),
  quietStart: f.quietStart === OFF ? null : f.quietStart,
  quietEnd: f.quietEnd === OFF ? null : f.quietEnd,
});
const LABELS = { digestTime: "Daily Digest", digestDays: "Digest covers", reminderHours: "Final Reminder", secondReminderHours: "Second reminder", quietStart: "Quiet hours start", quietEnd: "Quiet hours end" };

export function NotificationsSection({ initial }: { initial: NotifySettings }) {
  const router = useRouter();
  const form = useAppForm(Form, toForm(initial));
  const { errors, submitCount, isSubmitting } = form.formState;
  async function save(f: Form) {
    const res = await apiFetch<{ notify: NotifySettings }>("/settings", { method: "PATCH", body: { notify: fromForm(f, initial) } });
    if (!res.ok) {
      // A rule about the digest itself shows on the Daily Digest field.
      return applyServerError(form, { ...res.error, fieldErrors: res.error.fieldErrors && Object.fromEntries(Object.entries(res.error.fieldErrors).map(([k, v]) => [k === "digestOn" ? "digestTime" : k, v])) });
    }
    form.reset(toForm(res.data.notify));
    toast.success("Notifications saved");
    router.refresh();
  }
  async function reset() {
    form.reset(toForm(DEFAULTS));
    await save(toForm(DEFAULTS));
  }
  return (
    <section id="notifications" aria-labelledby="notifications-heading" className="scroll-mt-4 rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="notifications-heading" className="text-title font-semibold">Notifications</h2>
      <p className="mt-1 text-sm text-muted-foreground">Emails about your Deadlines. Alerts that need action now are sent even in quiet hours.</p>
      <form onSubmit={form.handleSubmit(save)} noValidate className="mt-4 space-y-4">
        <ErrorSummary errors={errors} submitCount={submitCount} labels={LABELS} />
        <div className="grid gap-4 md:grid-cols-2">
          <SelectField control={form.control} name="digestTime" label="Daily Digest" options={[{ value: OFF, label: "Off" }, ...halfHours(5, 11).map((t) => ({ value: t, label: `At ${t}` }))]} />
          <SelectField control={form.control} name="digestDays" label="Digest covers" options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: `Today and the next ${n} day${n === 1 ? "" : "s"}` }))} />
          <SelectField control={form.control} name="reminderHours" label="Final Reminder" options={REMINDER_HOURS.map((h) => ({ value: String(h), label: ahead(h) }))} />
          <SelectField control={form.control} name="secondReminderHours" label="Second reminder" options={[{ value: OFF, label: "Off" }, ...SECOND_REMINDER_HOURS.map((h) => ({ value: String(h), label: ahead(h) }))]} />
          <SelectField control={form.control} name="quietStart" label="Quiet hours start" options={[{ value: OFF, label: "Off" }, ...ALL_DAY.map((t) => ({ value: t, label: t }))]} />
          <SelectField control={form.control} name="quietEnd" label="Quiet hours end" options={[{ value: OFF, label: "Off" }, ...ALL_DAY.map((t) => ({ value: t, label: t }))]} />
        </div>
        <p className="text-sm text-muted-foreground">A reminder that would fall in quiet hours comes just before they start.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={reset} disabled={isSubmitting} className="max-md:w-full">
            <RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />
            Reset to default
          </Button>
          <SaveButton pending={isSubmitting} className="max-md:w-full">Save notifications</SaveButton>
        </div>
      </form>
    </section>
  );
}
