import { SemesterManager } from "@/components/app/semester-manager";
import { listSemesters } from "@/server/data/semesters";
import { requireStudentId } from "@/server/session";

// #6: Semesters. WhatsApp (#11), the Auto Changes switch (#15) and account settings (#17) join this page later.
export default async function SettingsPage() {
  const semesters = await listSemesters(await requireStudentId());
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Times are in Sri Lanka time (Asia/Colombo).</p>
      <div className="mt-6 space-y-6">
        <SemesterManager semesters={semesters} />
      </div>
    </>
  );
}
