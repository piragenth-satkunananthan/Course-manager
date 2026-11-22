import { getSettings, updateSettings } from "@/server/data/settings";
import { withStudent } from "@/server/http/with-student";
import { SettingsUpdate } from "@/shared/schemas/settings";

export const GET = withStudent({}, ({ studentId }) => getSettings(studentId));
export const PATCH = withStudent({ body: SettingsUpdate }, ({ studentId, body }) => updateSettings(studentId, body));
