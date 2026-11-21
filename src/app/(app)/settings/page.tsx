import { AccountSection } from "@/components/app/account-section";
import { SemesterManager } from "@/components/app/semester-manager";
import { listSemesters } from "@/server/data/semesters";
import { requireStudentEmail, requireStudentId } from "@/server/session";

// Semesters and Account (sign out). WhatsApp (#11), the Auto Changes switch (#15), and password and deletion (#17) join later.
export default async function SettingsPage() {
  const [semesters, email] = await Promise.all([requireStudentId().then(listSemesters), requireStudentEmail()]);
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Times are in Sri Lanka time (Asia/Colombo).</p>
      <div className="mt-6 space-y-6">
        <SemesterManager semesters={semesters} />
        <AccountSection email={email} />
      </div>
    </>
  );
}
