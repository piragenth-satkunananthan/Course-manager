import { deleteAccount } from "@/server/data/account";
import { withStudent } from "@/server/http/with-student";
import { AccountDelete } from "@/shared/schemas/account";

export const POST = withStudent({ body: AccountDelete }, ({ studentId, body }) => deleteAccount(studentId, body.password));
