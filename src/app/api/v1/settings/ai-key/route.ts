// Settings → AI key (#81, U45): save a checked key (encrypted), or go back to the server's. The key is never returned.
import { clearNimKey, saveNimKey } from "@/server/data/nim";
import { withStudent } from "@/server/http/with-student";
import { AiKeyUpdate } from "@/shared/schemas/ai";

export const PUT = withStudent({ body: AiKeyUpdate }, ({ studentId, body }) => saveNimKey(studentId, body.apiKey));
export const DELETE = withStudent({}, ({ studentId }) => clearNimKey(studentId));
