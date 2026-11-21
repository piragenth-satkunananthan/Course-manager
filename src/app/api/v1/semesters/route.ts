import { createSemester, listSemesters } from "@/server/data/semesters";
import { withStudent } from "@/server/http/with-student";
import { SemesterCreate } from "@/shared/schemas/semester";

export const GET = withStudent({}, ({ studentId }) => listSemesters(studentId));
export const POST = withStudent({ body: SemesterCreate, status: 201 }, ({ studentId, body }) => createSemester(studentId, body));
