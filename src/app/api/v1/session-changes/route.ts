import { createSessionChange } from "@/server/data/timetable";
import { withStudent } from "@/server/http/with-student";
import { SessionChangeCreate } from "@/shared/schemas/timetable";

export const POST = withStudent({ body: SessionChangeCreate, status: 201 }, ({ studentId, body }) => createSessionChange(studentId, body));
