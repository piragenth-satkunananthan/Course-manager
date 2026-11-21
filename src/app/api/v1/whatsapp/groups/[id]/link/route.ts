import { linkGroup } from "@/server/data/whatsapp";
import { withStudent } from "@/server/http/with-student";
import { GroupLink } from "@/shared/schemas/whatsapp";

export const PUT = withStudent({ body: GroupLink }, ({ studentId, id, body }) => linkGroup(studentId, id, body));
export const DELETE = withStudent({}, ({ studentId, id }) => linkGroup(studentId, id, null));
