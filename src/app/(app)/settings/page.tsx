import { AccountSection } from "@/components/app/account-section";
import { AiSection } from "@/components/app/ai-section";
import { EmailAlertsSection } from "@/components/app/email-alerts-section";
import { DashboardSection } from "@/components/app/dashboard-section";
import { getAiStatus } from "@/server/data/ai-status";
import { getAiKeyView } from "@/server/data/nim";
import { NotificationsSection } from "@/components/app/notifications-section";
import { SemesterManager } from "@/components/app/semester-manager";
import { WhatsAppSection } from "@/components/app/whatsapp-section";
import { listCourses } from "@/server/data/courses";
import { getWhatsApp } from "@/server/data/whatsapp";
import { listSemesters } from "@/server/data/semesters";
import { getSettings } from "@/server/data/settings";
import { requireStudentEmail, requireStudentId } from "@/server/session";

// Settings (docs/designs/settings.md): a section list (a side list on desktop, a jump list on phones), then
// Notifications (#79), AI (#80, #81), Email and alerts (#82), Semesters, WhatsApp (with the Auto Changes switch, #15) and Account (#17).
const SECTIONS = [
  { id: "notifications", label: "Notifications" },
  { id: "ai", label: "AI" },
  { id: "email", label: "Email and alerts" },
  { id: "dashboard", label: "Dashboard" },
  { id: "semesters", label: "Semesters" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "account", label: "Account" },
];

export default async function SettingsPage() {
  const studentId = await requireStudentId();
  const [semesters, email, whatsapp, settings, ai, aiKey] = await Promise.all([listSemesters(studentId), requireStudentEmail(), getWhatsApp(studentId), getSettings(studentId), getAiStatus(studentId), getAiKeyView(studentId)]);
  // Groups link to the current Semester (the Class Group) or one of its Courses.
  const current = semesters.find((s) => s.isCurrent) ?? null;
  const courses = current ? (await listCourses(studentId, { semesterId: current.id })).filter((c) => !c.archivedAt) : [];
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">Times are in Sri Lanka time (Asia/Colombo).</p>
      <div className="mt-6 md:grid md:grid-cols-[12rem_1fr] md:gap-8">
        <nav aria-label="Settings sections" className="mb-6 md:sticky md:top-4 md:mb-0 md:self-start">
          <ul className="flex flex-wrap gap-2 md:flex-col md:gap-1">
            {SECTIONS.map((x) => (
              <li key={x.id}>
                <a href={`#${x.id}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-muted md:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:border max-md:border-input md:min-h-10 md:w-full">
                  {x.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 space-y-6">
        <NotificationsSection initial={settings.notify} />
        <AiSection status={ai} keyView={aiKey} />
        <EmailAlertsSection email={settings.email} alertsOff={settings.alertsOff} />
        <DashboardSection initial={settings.dashboard} />
        <SemesterManager semesters={semesters} />
        <WhatsAppSection
          initial={whatsapp}
          semester={current && { id: current.id, label: current.name }}
          autoChangesPaused={settings.autoChangesPaused}
          courses={courses.map((c) => ({ id: c.id, label: `${c.code} ${c.name}`, code: c.practicalOfCourseId ? undefined : c.code }))}
        />
        <AccountSection email={email} />
        </div>
      </div>
    </>
  );
}
