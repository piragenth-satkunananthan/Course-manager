import { AccountSection } from "@/components/app/account-section";
import { SemesterManager } from "@/components/app/semester-manager";
import { WhatsAppSection } from "@/components/app/whatsapp-section";
import { listCourses } from "@/server/data/courses";
import { getWhatsApp } from "@/server/data/whatsapp";
import { listSemesters } from "@/server/data/semesters";
import { requireStudentEmail, requireStudentId } from "@/server/session";

// Semesters, WhatsApp and Account (sign out). The Auto Changes switch (#15), and password and deletion (#17) join later.
export default async function SettingsPage() {
  const studentId = await requireStudentId();
  const [semesters, email, whatsapp] = await Promise.all([listSemesters(studentId), requireStudentEmail(), getWhatsApp(studentId)]);
  // Groups link to the current Semester (the Class Group) or one of its Courses.
  const current = semesters.find((s) => s.isCurrent) ?? null;
  const courses = current ? (await listCourses(studentId, { semesterId: current.id })).filter((c) => !c.archivedAt) : [];
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Times are in Sri Lanka time (Asia/Colombo).</p>
      <div className="mt-6 space-y-6">
        <SemesterManager semesters={semesters} />
        <WhatsAppSection
          initial={whatsapp}
          semester={current && { id: current.id, label: current.name }}
          courses={courses.map((c) => ({ id: c.id, label: `${c.code} ${c.name}`, code: c.practicalOfCourseId ? undefined : c.code }))}
        />
        <AccountSection email={email} />
      </div>
    </>
  );
}
