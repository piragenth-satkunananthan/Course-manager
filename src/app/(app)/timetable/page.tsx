import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

// shortcut: placeholder until the day list ships (#8).
export default function TimetablePage() {
  return <ComingSoon title="Timetable" icon={CalendarDays}>Your weekly classes will show here, day by day.</ComingSoon>;
}
