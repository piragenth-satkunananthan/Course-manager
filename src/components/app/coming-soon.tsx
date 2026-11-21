import type { LucideIcon } from "lucide-react";
import { EmptyState } from "./empty-state";

/** A navigation destination whose screen ships in a later ticket, so its nav link never lands on "Page not found". */
export function ComingSoon({ title, icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">{title}</h1>
      <EmptyState icon={icon}>{children}</EmptyState>
    </>
  );
}
