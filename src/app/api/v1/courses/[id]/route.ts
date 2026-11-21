import { deleteCourse, getCourse, updateCourse } from "@/server/data/courses";
import { withStudent } from "@/server/http/with-student";
import { CourseDeleteQuery, CourseUpdate } from "@/shared/schemas/course";

export const GET = withStudent({}, ({ studentId, id }) => getCourse(studentId, id));
export const PATCH = withStudent({ body: CourseUpdate }, ({ studentId, id, body }) => updateCourse(studentId, id, body));
export const DELETE = withStudent({ query: CourseDeleteQuery }, ({ studentId, id, query }) => deleteCourse(studentId, id, query.confirmCode));
