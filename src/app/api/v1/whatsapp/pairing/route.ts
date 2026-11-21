import { requestPairing } from "@/server/data/whatsapp";
import { withStudent } from "@/server/http/with-student";
import { PairingRequest } from "@/shared/schemas/whatsapp";

export const POST = withStudent({ body: PairingRequest }, ({ studentId, body }) => requestPairing(studentId, body.phone));
