import { listNimModels } from "@/server/data/nim";
import { withStudent } from "@/server/http/with-student";

export const dynamic = "force-dynamic";
export const GET = withStudent({}, ({ studentId }) => listNimModels(studentId));
