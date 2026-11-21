import { createCourse, listCourses } from "@/server/data/courses";
import { withStudent } from "@/server/http/with-student";
import { CourseCreate, CourseListQuery } from "@/shared/schemas/course";

export const GET = withStudent({ query: CourseListQuery }, ({ studentId, query }) => listCourses(studentId, query));
export const POST = withStudent({ body: CourseCreate, status: 201 }, ({ studentId, body }) => createCourse(studentId, body));
