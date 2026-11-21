import { deleteClassSession, updateClassSession } from "@/server/data/timetable";
import { withStudent } from "@/server/http/with-student";
import { ClassSessionUpdate } from "@/shared/schemas/timetable";

export const PATCH = withStudent({ body: ClassSessionUpdate }, ({ studentId, id, body }) => updateClassSession(studentId, id, body));
export const DELETE = withStudent({}, ({ studentId, id }) => deleteClassSession(studentId, id));
