"use client";
// Settings → AI (#80): whether the AI is working, delayed, stopped or paused, and "Test AI now".
import { CircleCheck, CirclePause, CircleX, Clock, LoaderCircle, Zap } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";
import { instantToLocal } from "@/server/domain/time";
import type { AiState } from "@/server/domain/ai-status";

const when = (iso: string) => {
  const { date, time } = instantToLocal(new Date(iso));
  return `${formatDate(date)}, ${time}`;
};

export type AiStatusView = { state: AiState; lastSuccessAt: string | null; waiting: number; problem: string | null; model: string | null };
type TestResult = { ok: true; ms: number; model: string } | { ok: false; problem: string };
type Shown = TestResult | { ok: "error"; message: string }; // the test itself couldn't run (too soon, offline)

const STATES: Record<AiState, { label: string; icon: typeof CircleCheck; className: string }> = {
  working: { label: "Working", icon: CircleCheck, className: "text-success" },
  delayed: { label: "Delayed", icon: Clock, className: "text-warning" },
  stopped: { label: "Stopped", icon: CircleX, className: "text-destructive" },
  paused: { label: "Paused", icon: CirclePause, className: "text-muted-foreground" },
};

export function AiSection({ status }: { status: AiStatusView }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Shown | null>(null);
  const s = STATES[status.state];
  async function test() {
    setTesting(true);
    setResult(null);
    const res = await apiFetch<TestResult>("/ai/test", { method: "POST" });
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
        <dt className="text-muted-foreground">Last change made</dt>
        <dd>{status.lastSuccessAt ? when(status.lastSuccessAt) : "None yet"}</dd>
        <dt className="text-muted-foreground">Messages waiting</dt>
        <dd>{status.waiting}</dd>
        <dt className="text-muted-foreground">Model</dt>
        <dd className="break-all">{status.model ?? "Not set"}</dd>
      </dl>
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
