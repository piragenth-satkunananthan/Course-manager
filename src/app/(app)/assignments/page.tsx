import { ListChecks } from "lucide-react";
import Link from "next/link";
import { ComingSoon } from "@/components/app/coming-soon";

// shortcut: placeholder until the Assignment and Exam list pages ship (#21, M1b).
export default function DeadlinesPage() {
  return (
    <ComingSoon title="Deadlines" icon={ListChecks}>
      Filterable lists of Assignments and Exams are coming. For now, your Deadlines are on the{" "}
      <Link href="/" className="font-semibold text-primary underline">dashboard</Link>.
    </ComingSoon>
  );
}
