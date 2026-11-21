import { archiveCourse } from "@/server/data/courses";
import { withStudent } from "@/server/http/with-student";

export const POST = withStudent({}, ({ studentId, id }) => archiveCourse(studentId, id));
