// Settings → Email (#82): ask to send emails to another address (a confirmation link goes there), or go back to the login email.
import { clearEmail, requestEmail } from "@/server/data/email-settings";
import { withStudent } from "@/server/http/with-student";
import { EmailUpdate } from "@/shared/schemas/settings";

export const PUT = withStudent({ body: EmailUpdate }, ({ studentId, body }) => requestEmail(studentId, body.email));
export const DELETE = withStudent({}, ({ studentId }) => clearEmail(studentId));
