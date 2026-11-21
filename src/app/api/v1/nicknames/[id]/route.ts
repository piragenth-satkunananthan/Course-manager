import { removeNickname } from "@/server/data/courses";
import { withStudent } from "@/server/http/with-student";

export const DELETE = withStudent({}, ({ studentId, id }) => removeNickname(studentId, id));
