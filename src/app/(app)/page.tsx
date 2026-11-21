import { BookPlus, Link as LinkIcon } from "lucide-react";
import Link from "next/link";

// #5: the empty state only. Overdue, Today and Due soon arrive with #7 and #8.
export default function DashboardPage() {
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Dashboard</h1>
      <section className="mt-12 flex flex-col items-center text-center">
        <BookPlus size={48} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
        <p className="mt-4 max-w-prose">Add your Courses and the Deadlines you already know about.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/courses" className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover md:min-h-10">
            Add Course
          </Link>
          <Link href="/settings#whatsapp" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-input bg-card px-4 text-sm font-semibold md:min-h-10">
            <LinkIcon size={16} aria-hidden="true" />
            Link WhatsApp
          </Link>
        </div>
      </section>
    </>
  );
}
