import { archiveSemester } from "@/server/data/semesters";
import { withStudent } from "@/server/http/with-student";

export const POST = withStudent({}, ({ studentId, id }) => archiveSemester(studentId, id));
