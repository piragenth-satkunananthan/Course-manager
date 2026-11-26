// Settings → AI model (#81, U45): choose a model the key can use; the previous one is kept for "Switch back".
import { setNimModel } from "@/server/data/nim";
import { withStudent } from "@/server/http/with-student";
import { AiModelUpdate } from "@/shared/schemas/ai";

export const PUT = withStudent({ body: AiModelUpdate }, ({ studentId, body }) => setNimModel(studentId, body.model));
