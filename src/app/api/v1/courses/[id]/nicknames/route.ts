import { addNickname } from "@/server/data/courses";
import { withStudent } from "@/server/http/with-student";
import { NicknameCreate } from "@/shared/schemas/course";

export const POST = withStudent({ body: NicknameCreate, status: 201 }, ({ studentId, id, body }) => addNickname(studentId, id, body.nickname));
