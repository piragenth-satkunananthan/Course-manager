import { deleteSessionChange, updateSessionChange } from "@/server/data/timetable";
import { withStudent } from "@/server/http/with-student";
import { VersionQuery } from "@/shared/schemas/common";
import { SessionChangeUpdate } from "@/shared/schemas/timetable";

export const PATCH = withStudent({ body: SessionChangeUpdate }, ({ studentId, id, body }) => updateSessionChange(studentId, id, body));
export const DELETE = withStudent({ query: VersionQuery }, ({ studentId, id, query }) => deleteSessionChange(studentId, id, query.expectedVersion));
