import { createClassSession } from "@/server/data/timetable";
import { withStudent } from "@/server/http/with-student";
import { ClassSessionCreate } from "@/shared/schemas/timetable";

export const POST = withStudent({ body: ClassSessionCreate, status: 201 }, ({ studentId, id, body }) => createClassSession(studentId, id, body));
