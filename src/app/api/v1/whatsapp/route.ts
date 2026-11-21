import { getWhatsApp, requestUnlink } from "@/server/data/whatsapp";
import { withStudent } from "@/server/http/with-student";

export const GET = withStudent({}, ({ studentId }) => getWhatsApp(studentId));
export const DELETE = withStudent({}, ({ studentId }) => requestUnlink(studentId));
