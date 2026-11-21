import type { LucideIcon } from "lucide-react";

/** An icon, one sentence saying what will appear here, and the action that fills it (design-system §5, §6.12). */
export function EmptyState({ icon: Icon, children, action }: { icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-12 flex flex-col items-center text-center">
      <Icon size={48} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
      <p className="mt-4 max-w-prose">{children}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </section>
  );
}
