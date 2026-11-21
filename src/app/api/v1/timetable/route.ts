import { getWeek } from "@/server/data/timetable";
import { withStudent } from "@/server/http/with-student";
import { TimetableQuery } from "@/shared/schemas/timetable";

export const GET = withStudent({ query: TimetableQuery }, ({ studentId, query }) => getWeek(studentId, query.week));
