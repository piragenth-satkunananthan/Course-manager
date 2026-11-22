import { resolveUnknownCourse } from "@/server/data/activity";
import { withStudent } from "@/server/http/with-student";
import { UnknownCourseResolve } from "@/shared/schemas/activity";

export const POST = withStudent({ body: UnknownCourseResolve }, ({ studentId, id, body }) => resolveUnknownCourse(studentId, id, body));
