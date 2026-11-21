import { createAssignment, listAssignments } from "@/server/data/assessments";
import { withStudent } from "@/server/http/with-student";
import { AssignmentCreate, AssignmentListQuery } from "@/shared/schemas/assignment";

export const GET = withStudent({ query: AssignmentListQuery }, ({ studentId, query }) => listAssignments(studentId, query));
export const POST = withStudent({ body: AssignmentCreate, status: 201 }, ({ studentId, body }) => createAssignment(studentId, body));
