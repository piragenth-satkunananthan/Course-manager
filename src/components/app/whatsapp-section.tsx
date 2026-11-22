"use client";
// Settings → WhatsApp (design-system §7.6): pairing by phone code (U1), linking groups, and unlinking.
import { CircleCheck, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { suggestCourse } from "@/lib/suggest-course";
import { PairingRequest, WaGroup, WhatsAppStatus } from "@/shared/schemas/whatsapp";
import { applyServerError, ErrorSummary, SaveButton, TextField, useAppForm } from "./form";

/** `code` is set on Courses a group may be named after (not Practical Courses), for the suggestion. */
type Option = { id: string; label: string; code?: string };
const PAIRING_SECONDS = 180;

function PairingForm({ onStarted, retry }: { onStarted: (s: WhatsAppStatus) => void; retry: boolean }) {
  const form = useAppForm(PairingRequest, { phone: "" });
  const { isSubmitting, errors, submitCount } = form.formState;
  async function onSubmit(v: PairingRequest) {
    const res = await apiFetch("/whatsapp/pairing", { method: "POST", body: v, schema: WhatsAppStatus });
    if (!res.ok) return applyServerError(form, res.error);
    onStarted(res.data);
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ phone: "Phone number" }} />
      <TextField control={form.control} name="phone" label="Phone number" type="tel" autoComplete="tel" required help="Digits with country code, e.g. 94771234567" />
      <SaveButton pending={isSubmitting}>{retry ? "Try again" : "Get pairing code"}</SaveButton>
    </form>
  );
}

function PairingCode({ code, startedAt }: { code: string | null; startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, PAIRING_SECONDS - Math.floor((now - startedAt) / 1000));
  return (
    <div className="mt-4 space-y-2" aria-live="polite">
      {code ? (
        <>
          <p className="font-mono text-3xl font-bold tracking-[0.3em] tabular-nums" aria-label={`Pairing code ${code.split("").join(" ")}`}>{code}</p>
          <p>On your phone: WhatsApp → Settings → Linked devices → Link with phone number, then enter this code.</p>
        </>
      ) : (
        <p>Getting a code…</p>
      )}
      <p className="text-sm text-muted-foreground tabular-nums">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} left
      </p>
    </div>
  );
}

function GroupRow({ group, courses, semester }: { group: WaGroup; courses: Option[]; semester: Option | null }) {
  const router = useRouter();
  const value = group.linkedCourseId ?? (group.linkedSemesterId ? `semester:${group.linkedSemesterId}` : "none");
  async function change(v: string) {
    const res =
      v === "none"
        ? await apiFetch(`/whatsapp/groups/${group.id}/link`, { method: "DELETE" })
        : await apiFetch(`/whatsapp/groups/${group.id}/link`, { method: "PUT", body: v.startsWith("semester:") ? { semesterId: v.slice(9) } : { courseId: v } });
    if (!res.ok) return toastApiError(res.error);
    toast.success(v === "none" ? `${group.subject} is no longer read` : `${group.subject} is linked`);
    router.refresh();
  }
  const id = `group-${group.id}`;
  // Only a suggestion: nothing is read until the Student confirms it (U13).
  const suggested = value === "none" ? suggestCourse(group.subject, courses.filter((c): c is Option & { code: string } => !!c.code)) : undefined;
  return (
    <li className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col items-start gap-2">
        <label htmlFor={id} className="font-medium">{group.subject}</label>
        {suggested && (
          <Button variant="outline" size="sm" className="min-h-11 md:min-h-10" onClick={() => change(suggested.id)}>
            Link to {suggested.code}
          </Button>
        )}
      </div>
      <Select value={value} onValueChange={change}>
        <SelectTrigger id={id} className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not linked</SelectItem>
          {semester && <SelectItem value={`semester:${semester.id}`}>Class Group · {semester.label}</SelectItem>}
          {courses.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </li>
  );
}

export function WhatsAppSection({ initial, courses, semester }: { initial: WhatsAppStatus; courses: Option[]; semester: Option | null }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [pairingSince, setPairingSince] = useState(() => Date.now());
  const [unlinking, setUnlinking] = useState(false);
  // Take fresh server data after router.refresh() (adjusting state during render, as React recommends).
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setState(initial);
  }

  // While pairing, the worker updates the row; poll it every 2 seconds (design §8).
  useEffect(() => {
    if (state.status !== "pairing") return;
    const t = setInterval(async () => {
      const res = await apiFetch("/whatsapp", { schema: WhatsAppStatus });
      if (!res.ok) return;
      setState(res.data);
      if (res.data.status !== "pairing") router.refresh();
    }, 2000);
    return () => clearInterval(t);
  }, [state.status, router]);

  async function unlink() {
    setUnlinking(false);
    const res = await apiFetch("/whatsapp", { method: "DELETE" });
    if (!res.ok) return toastApiError(res.error);
    toast.success("Unlinking WhatsApp…");
    setTimeout(() => router.refresh(), 2500);
  }

  return (
    <section id="whatsapp" aria-labelledby="whatsapp-heading" className="scroll-mt-4 rounded-md border border-border bg-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="whatsapp-heading" className="text-title font-semibold">WhatsApp</h2>
        {state.status === "connected" ? (
          <Badge className="bg-success-subtle text-success"><CircleCheck aria-hidden="true" />Connected</Badge>
        ) : (
          <Badge variant="secondary" className="text-muted-foreground"><WifiOff aria-hidden="true" />Not connected</Badge>
        )}
      </div>

      {state.lastError && state.status !== "connected" && state.status !== "pairing" && (
        <p role="alert" className="mt-4 rounded-sm bg-destructive-subtle p-3 text-sm font-medium text-destructive">{state.lastError}</p>
      )}

      {state.status === "pairing" && <PairingCode code={state.pairingCode} startedAt={pairingSince} />}

      {(state.status === "unlinked" || state.status === "logged_out" || state.status === "error") && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Link your WhatsApp so announcements in your class groups become changes here. Only groups you link are read; the app never sends anything.</p>
          <PairingForm retry={!!state.lastError} onStarted={(s) => (setPairingSince(Date.now()), setState(s))} />
        </>
      )}

      {state.status === "connected" && (
        <>
          <h3 className="mt-4 font-semibold">Linked groups</h3>
          <p className="text-sm text-muted-foreground">Only linked groups are read. Other chats are ignored.</p>
          {state.groups.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Your groups will appear here in a moment.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border" aria-label="WhatsApp groups">
              {state.groups.map((g) => (
                <GroupRow key={g.id} group={g} courses={courses} semester={semester} />
              ))}
            </ul>
          )}
          <Button variant="outline" className="mt-4" onClick={() => setUnlinking(true)}>Unlink WhatsApp</Button>
        </>
      )}

      <AlertDialog open={unlinking} onOpenChange={setUnlinking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>The app logs out of WhatsApp and stops reading your groups. Messages already stored stay until their Semester is archived.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={unlink}>Unlink WhatsApp</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
