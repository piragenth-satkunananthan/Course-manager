"use client";
// Settings → Email and alerts (U46, #82): send emails to a confirmed address, and turn alert kinds off. Alerts turned
// off still show in the Activity Log; the reminder-failure alert and healthchecks.io's emails can't be turned off.
import { Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api-fetch";
import { ALERT_GROUP_IDS, type EmailSetting } from "@/shared/schemas/settings";

const ALERTS: Record<(typeof ALERT_GROUP_IDS)[number], string> = {
  whatsapp: "WhatsApp disconnected or logged out",
  ai: "The AI keeps failing, or NVIDIA refused the key",
  overflow: "Too many changes in one batch",
};

export function EmailAlertsSection({ email, alertsOff }: { email: EmailSetting; alertsOff: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const fieldId = useId();
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(new Set(alertsOff));
  const linkResult = params.get("email");
  useEffect(() => {
    if (linkResult === "confirmed") toast.success("Email confirmed. Reminders and alerts now go there.");
    else if (linkResult === "link-invalid") toast.error("That confirmation link has expired or was already used. Ask for a new one.");
  }, [linkResult]);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await apiFetch("/settings/email", { method: "PUT", body: { email: address } });
    setBusy(false);
    if (!res.ok) return setError(res.error.fieldErrors?.email ?? res.error.message);
    setAddress("");
    toast.success("Check that inbox: open the link to start using it.");
    router.refresh();
  }
  async function useLogin() {
    setBusy(true);
    const res = await apiFetch("/settings/email", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast.error(res.error.message);
    toast.success("Emails go to your login email");
    router.refresh();
  }
  async function toggle(group: string, emailed: boolean) {
    const next = new Set(off);
    if (emailed) next.delete(group);
    else next.add(group);
    setOff(next);
    const res = await apiFetch("/settings", { method: "PATCH", body: { alertsOff: [...next] } });
    if (!res.ok) {
      setOff(off);
      return toast.error(res.error.message);
    }
    toast.success("Alerts saved");
  }

  return (
    <section id="email" aria-labelledby="email-heading" className="scroll-mt-4 rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="email-heading" className="text-title font-semibold">Email and alerts</h2>
      <p className="mt-2 text-sm">
        Reminders, digests and alerts go to <strong className="break-all">{email.address}</strong>
        {email.address === email.loginEmail ? " (your login email)." : "."}
      </p>
      {email.pending && (
        <p role="status" className="mt-2 rounded-md bg-warning-subtle p-3 text-sm">
          Waiting for you to open the link sent to <strong className="break-all">{email.pending}</strong>. Until then, emails go to {email.address}.
        </p>
      )}
      <form onSubmit={request} noValidate className="mt-4 space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium">
          Send emails to another address
        </label>
        <Input id={fieldId} type="email" autoComplete="email" value={address} onChange={(e) => setAddress(e.target.value)} aria-invalid={!!error} aria-describedby={error ? `${fieldId}-error` : `${fieldId}-help`} />
        <p id={`${fieldId}-help`} className="text-sm text-muted-foreground">We&apos;ll email a link there; it&apos;s used once you open it. You still sign in with your login email.</p>
        {error && (
          <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !address.trim()} className="max-md:w-full">
            <Mail size={20} strokeWidth={1.75} aria-hidden="true" />
            Send confirmation link
          </Button>
          {(email.address !== email.loginEmail || email.pending) && (
            <Button type="button" variant="outline" onClick={useLogin} disabled={busy} className="max-md:w-full">
              Use my login email
            </Button>
          )}
        </div>
      </form>
      <fieldset className="mt-6 space-y-1">
        <legend className="font-semibold">Alerts to email</legend>
        {ALERT_GROUP_IDS.map((g) => (
          <label key={g} className="flex min-h-11 items-center gap-3 md:min-h-10">
            <Checkbox checked={!off.has(g)} onCheckedChange={(v) => toggle(g, v === true)} />
            <span className="text-sm">{ALERTS[g]}</span>
          </label>
        ))}
        <p className="pt-1 text-sm text-muted-foreground">
          Alerts you turn off still show in the Activity Log. &quot;A reminder couldn&apos;t be sent&quot; is always emailed, and the server&apos;s health checks email you if the app itself stops.
        </p>
      </fieldset>
    </section>
  );
}
