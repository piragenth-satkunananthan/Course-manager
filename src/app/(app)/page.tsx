import { BookPlus, Link as LinkIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Button } from "@/components/ui/button";

// #5: the empty state only. Overdue, Today and Due soon arrive with #7 and #8.
export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Dashboard</h1>
      <EmptyState
        icon={BookPlus}
        action={
          <>
            <Button asChild>
              <Link href="/courses">Add Course</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings#whatsapp">
                <LinkIcon size={20} strokeWidth={1.75} aria-hidden="true" />
                Link WhatsApp
              </Link>
            </Button>
          </>
        }
      >
        Add your Courses and the Deadlines you already know about.
      </EmptyState>
    </>
  );
}
