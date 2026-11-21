import { setAssignmentStatus } from "@/server/data/assessments";
import { withStudent } from "@/server/http/with-student";
import { AssignmentStatusPut } from "@/shared/schemas/assignment";

export const PUT = withStudent({ body: AssignmentStatusPut }, ({ studentId, id, body }) => setAssignmentStatus(studentId, id, body.status));
