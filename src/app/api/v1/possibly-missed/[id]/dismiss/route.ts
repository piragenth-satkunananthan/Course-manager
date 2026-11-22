import { dismissPossiblyMissed } from "@/server/data/activity";
import { withStudent } from "@/server/http/with-student";

export const POST = withStudent({}, ({ studentId, id }) => dismissPossiblyMissed(studentId, id));
