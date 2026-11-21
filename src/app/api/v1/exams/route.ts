import { createExam, listExams } from "@/server/data/assessments";
import { withStudent } from "@/server/http/with-student";
import { ExamCreate, ExamListQuery } from "@/shared/schemas/exam";

export const GET = withStudent({ query: ExamListQuery }, ({ studentId, query }) => listExams(studentId, query));
export const POST = withStudent({ body: ExamCreate, status: 201 }, ({ studentId, body }) => createExam(studentId, body));
