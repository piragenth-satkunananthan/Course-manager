import { getAiStatus } from "@/server/data/ai-status";
import { withStudent } from "@/server/http/with-student";

export const dynamic = "force-dynamic";
export const GET = withStudent({}, ({ studentId }) => getAiStatus(studentId));
