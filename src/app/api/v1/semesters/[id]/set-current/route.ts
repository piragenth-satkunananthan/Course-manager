import { setCurrentSemester } from "@/server/data/semesters";
import { withStudent } from "@/server/http/with-student";

export const POST = withStudent({}, ({ studentId, id }) => setCurrentSemester(studentId, id));
