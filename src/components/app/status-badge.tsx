// Always an icon plus a word, from a fixed set (design-system §6.4).
import { CircleAlert, CircleCheck, CircleHelp, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const KINDS = {
  overdue: { label: "Overdue", icon: CircleAlert, className: "bg-destructive-subtle text-destructive" },
  dueToday: { label: "Due today", icon: Clock, className: "bg-warning-subtle text-warning" },
  dueTomorrow: { label: "Due tomorrow", icon: Clock, className: "bg-warning-subtle text-warning" },
  submitted: { label: "Submitted", icon: CircleCheck, className: "bg-success-subtle text-success" },
  tba: { label: "TBA", icon: CircleHelp, className: "bg-muted text-muted-foreground" },
} as const;

export type StatusKind = keyof typeof KINDS;

export function StatusBadge({ kind }: { kind: StatusKind }) {
  const { label, icon: Icon, className } = KINDS[kind];
  return (
    <Badge className={className}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}
