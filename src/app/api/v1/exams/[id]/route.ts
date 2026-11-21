import { deleteExam, updateExam } from "@/server/data/assessments";
import { withStudent } from "@/server/http/with-student";
import { VersionQuery } from "@/shared/schemas/assignment";
import { ExamUpdate } from "@/shared/schemas/exam";

export const PATCH = withStudent({ body: ExamUpdate }, ({ studentId, id, body }) => updateExam(studentId, id, body));
export const DELETE = withStudent({ query: VersionQuery }, ({ studentId, id, query }) => deleteExam(studentId, id, query.expectedVersion));
