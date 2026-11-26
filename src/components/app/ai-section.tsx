"use client";
// Settings → AI: whether the AI is working, delayed, stopped or paused, and "Test AI now" (#80); the Student's own
// NVIDIA key and model (#81, U45): the key is sent in once and only ever shown as ••••last4.
import { CircleCheck, CirclePause, CircleX, Clock, KeyRound, LoaderCircle, Undo2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";
import { instantToLocal } from "@/server/domain/time";
import { AiKeySaved, type AiKeyView, AiModels, type AiState, type AiStatus, AiTestResult } from "@/shared/schemas/ai";

const when = (iso: string) => {
  const { date, time } = instantToLocal(new Date(iso));
  return `${formatDate(date)}, ${time}`;
};

type Shown = AiTestResult | { ok: "error"; message: string }; // the test itself couldn't run (too soon, offline)

const STATES: Record<AiState, { label: string; icon: typeof CircleCheck; className: string }> = {
  working: { label: "Working", icon: CircleCheck, className: "text-success" },
  delayed: { label: "Delayed", icon: Clock, className: "text-warning" },
  stopped: { label: "Stopped", icon: CircleX, className: "text-destructive" },
  paused: { label: "Paused", icon: CirclePause, className: "text-muted-foreground" },
};

export function AiSection({ status, keyView }: { status: AiStatus; keyView: AiKeyView }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Shown | null>(null);
  const s = STATES[status.state];
  async function test() {
    setTesting(true);
    setResult(null);
    const res = await apiFetch("/ai/test", { method: "POST", schema: AiTestResult });
    setResult(res.ok ? res.data : { ok: "error", message: res.error.message });
    setTesting(false);
  }
  return (
    <section id="ai" aria-labelledby="ai-heading" className="scroll-mt-4 rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="ai-heading" className="text-title font-semibold">AI</h2>
      <p className="mt-1 text-sm text-muted-foreground">The AI reads your linked WhatsApp groups and makes Auto Changes.</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Status</dt>
        <dd className={`flex items-center gap-1 font-semibold ${s.className}`}>
          <s.icon size={20} strokeWidth={1.75} aria-hidden="true" />
          {s.label}
        </dd>
        {status.problem && (
          <>
            <dt className="text-muted-foreground">Problem</dt>
            <dd>{status.problem}</dd>
          </>
        )}
        {status.lastError && status.lastError !== status.problem && (
          <>
            <dt className="text-muted-foreground">Last error</dt>
            <dd>{status.lastError}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Last change made</dt>
        <dd>{status.lastSuccessAt ? when(status.lastSuccessAt) : "None yet"}</dd>
        <dt className="text-muted-foreground">Messages waiting</dt>
        <dd>{status.waiting}</dd>
      </dl>
      <KeyAndModel keyView={keyView} onModelChanged={test} />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={test} disabled={testing} className="max-md:w-full">
          {testing ? <LoaderCircle size={20} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Zap size={20} strokeWidth={1.75} aria-hidden="true" />}
          {testing ? "Testing…" : "Test AI now"}
        </Button>
        <p role="status" className="text-sm">
          {result && (result.ok === "error" ? result.message : result.ok ? `Working: answered in ${(result.ms / 1000).toFixed(1)} s` : `Not working: ${result.problem}`)}
        </p>
      </div>
    </section>
  );
}

/** The key (paste a new one, or go back to the server's) and the model (with Switch back). */
function KeyAndModel({ keyView, onModelChanged }: { keyView: AiKeyView; onModelChanged: () => void }) {
  const router = useRouter();
  const keyId = useId();
  const modelId = useId();
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState(keyView.model ?? "");
  const [modelError, setModelError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void apiFetch("/ai/models", { schema: AiModels }).then((r) => live && setModels(r.ok ? r.data.models : []));
    return () => {
      live = false;
    };
  }, [keyView.keyMasked]);

  async function saveKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setKeyError(null);
    const res = await apiFetch("/settings/ai-key", { method: "PUT", body: { apiKey: key }, schema: AiKeySaved });
    setBusy(false);
    if (!res.ok) return setKeyError(res.error.fieldErrors?.apiKey ?? res.error.message);
    setKey("");
    if (res.data.modelReset) {
      setModel(res.data.model ?? "");
      toast.success(`Key saved. It can't use ${res.data.modelReset}, so the AI went back to the server's model.`);
    } else toast.success("Key saved. The AI uses it from its next batch.");
    router.refresh();
  }
  async function useServerKey() {
    setBusy(true);
    const res = await apiFetch("/settings/ai-key", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast.error(res.error.message);
    toast.success("Using the server's key");
    router.refresh();
  }
  async function chooseModel(next: string) {
    setBusy(true);
    setModelError(null);
    const res = await apiFetch("/settings/ai-model", { method: "PUT", body: { model: next } });
    setBusy(false);
    if (!res.ok) return setModelError(res.error.fieldErrors?.model ?? res.error.message);
    setModel(next);
    toast.success(`Model changed to ${next}`);
    router.refresh();
    onModelChanged(); // check the new model at once
  }

  return (
    <div className="mt-6 space-y-6 border-t border-border pt-4">
      <form onSubmit={saveKey} noValidate className="space-y-2">
        <h3 className="font-semibold">API key</h3>
        <p className="text-sm">
          {keyView.keySource === "saved" ? "Your own key" : "The server's key"}
          {keyView.keyMasked && <span className="ml-2 font-mono">{keyView.keyMasked}</span>}
        </p>
        <label htmlFor={keyId} className="block text-sm font-medium">
          New NVIDIA API key
        </label>
        <Input id={keyId} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} aria-invalid={!!keyError} aria-describedby={keyError ? `${keyId}-error` : `${keyId}-help`} />
        <p id={`${keyId}-help`} className="text-sm text-muted-foreground">Checked with NVIDIA before it&apos;s saved. Stored encrypted; only its last 4 characters are ever shown.</p>
        {keyError && (
          <p id={`${keyId}-error`} role="alert" className="text-sm text-destructive">
            {keyError}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy || !key.trim()} className="max-md:w-full">
            <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
            Save key
          </Button>
          {keyView.keySource === "saved" && (
            <Button type="button" variant="outline" onClick={useServerKey} disabled={busy} className="max-md:w-full">
              Use the server&apos;s key
            </Button>
          )}
        </div>
      </form>

      <div className="space-y-2">
        <label htmlFor={modelId} className="block font-semibold">
          Model
        </label>
        <Select value={model} onValueChange={chooseModel} disabled={busy || !models?.length}>
          <SelectTrigger id={modelId} className="w-full" aria-invalid={!!modelError} aria-describedby={modelError ? `${modelId}-error` : `${modelId}-help`}>
            <SelectValue placeholder={models === null ? "Loading models…" : "No models available"} />
          </SelectTrigger>
          <SelectContent>
            {(models ?? []).map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modelError && (
          <p id={`${modelId}-error`} role="alert" className="text-sm text-destructive">
            {modelError}
          </p>
        )}
        <p id={`${modelId}-help`} className="text-sm text-muted-foreground">
          The AI&apos;s test messages were checked on the server&apos;s model. Another model may read your messages differently: Test AI now runs when you change it, and you can switch back.
        </p>
        {keyView.previousModel && (
          <Button type="button" variant="outline" onClick={() => chooseModel(keyView.previousModel!)} disabled={busy} className="max-md:w-full">
            <Undo2 size={20} strokeWidth={1.75} aria-hidden="true" />
            Switch back to {keyView.previousModel}
          </Button>
        )}
      </div>
    </div>
  );
}
