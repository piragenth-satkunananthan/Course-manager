"use client";
// One Auto Change (design-system §6.5): summary, risk badge, source message, and Undo or the reason it's blocked.
import { ArrowRightLeft, Ban, CircleCheck, Sparkles, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";
import { instantToLocal } from "@/server/domain/time";
import { AutoChangeItem as Item } from "@/shared/schemas/activity";

const when = (iso: string) => {
  const l = instantToLocal(new Date(iso));
  return `${formatDate(l.date)}, ${l.time}`;
};

export function AutoChangeItem({ item }: { item: Item }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function undo() {
    setPending(true);
    const res = await apiFetch(`/auto-changes/${item.id}/undo`, { method: "POST", schema: Item });
    setPending(false);
    if (!res.ok) {
      toastApiError(res.error);
      return router.refresh(); // blocked meanwhile: show why
    }
    toast.success(`Undone: ${item.summary}`);
    router.refresh();
  }

  const reasonId = `undo-reason-${item.id}`;
  return (
    <li className="rounded-md border border-border bg-card p-3">
      <p className="flex items-start gap-2 font-semibold">
        <Sparkles size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
        <span className={item.undoneAt ? "text-muted-foreground line-through" : ""}>{item.summary}</span>
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {item.risk === "moved_later" && <Badge className="bg-warning-subtle text-warning"><ArrowRightLeft aria-hidden="true" />Moved later</Badge>}
        {item.risk === "cancelled" && <Badge className="bg-warning-subtle text-warning"><Ban aria-hidden="true" />Cancelled</Badge>}
        {item.undoneAt && <Badge variant="secondary" className="text-muted-foreground"><CircleCheck aria-hidden="true" />Undone</Badge>}
      </div>
      {item.sources.map((s, i) => (
        <SourceMessage key={i} message={s} />
      ))}
      {!item.undoneAt && (
        <div className="mt-2 flex flex-col items-end gap-1">
          <Button variant="outline" onClick={undo} disabled={!item.canUndo || pending} aria-describedby={item.canUndo ? undefined : reasonId}>
            <Undo2 size={20} strokeWidth={1.75} aria-hidden="true" />
            Undo
          </Button>
          {!item.canUndo && item.undoBlockedReason && (
            <p id={reasonId} className="text-sm text-muted-foreground">{item.undoBlockedReason}</p>
          )}
        </div>
      )}
    </li>
  );
}

/** A WhatsApp message in the Activity Log: group, sender, time, and its text clamped to two lines with Show more. */
export function SourceMessage({ message: s }: { message: Item["sources"][number] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 text-sm">
      <p className="text-muted-foreground">
        From {s.groupSubject}
        {s.senderName ? ` · ${s.senderName}` : ""} · {when(s.sentAt)}
      </p>
      {s.text && (
        <>
          <blockquote className={`mt-1 border-l-2 border-border pl-2 ${expanded ? "" : "line-clamp-2"}`}>&ldquo;{s.text}&rdquo;</blockquote>
          {s.text.length > 120 && (
            <button type="button" onClick={() => setExpanded(!expanded)} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline md:min-h-10">
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
