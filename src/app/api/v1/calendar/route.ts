import { getMonth } from "@/server/data/calendar";
import { withStudent } from "@/server/http/with-student";
import { CalendarQuery } from "@/shared/schemas/calendar";

export const GET = withStudent({ query: CalendarQuery }, ({ studentId, query }) => getMonth(studentId, query.month));
