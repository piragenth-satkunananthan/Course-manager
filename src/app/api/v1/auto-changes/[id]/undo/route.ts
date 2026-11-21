import { undoAutoChange } from "@/server/data/activity";
import { withStudent } from "@/server/http/with-student";

export const POST = withStudent({}, ({ studentId, id }) => undoAutoChange(studentId, id));
