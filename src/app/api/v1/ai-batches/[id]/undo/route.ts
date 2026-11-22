import { undoBatch } from "@/server/data/activity";
import { withStudent } from "@/server/http/with-student";

export const POST = withStudent({}, ({ studentId, id }) => undoBatch(studentId, id));
