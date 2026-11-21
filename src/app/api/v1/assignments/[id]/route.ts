import { deleteAssignment, updateAssignment } from "@/server/data/assessments";
import { withStudent } from "@/server/http/with-student";
import { AssignmentUpdate, VersionQuery } from "@/shared/schemas/assignment";

export const PATCH = withStudent({ body: AssignmentUpdate }, ({ studentId, id, body }) => updateAssignment(studentId, id, body));
export const DELETE = withStudent({ query: VersionQuery }, ({ studentId, id, query }) => deleteAssignment(studentId, id, query.expectedVersion));
