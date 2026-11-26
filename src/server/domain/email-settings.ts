// Settings → Email and alerts (U46, #82): where emails go, and which alert kinds the Student can turn off.

/** The confirmed address, else the login email. A new address is used only once its link is opened. */
export const recipient = (u: { email: string; notifyEmail: string | null }) => u.notifyEmail ?? u.email;

/** The alert kinds that can be turned off, as the causes they cover. "A reminder couldn't be sent" can't be. */
import type { ALERT_GROUP_IDS } from "@/shared/schemas/settings";

export const ALERT_GROUPS = {
  whatsapp: ["whatsapp_logged_out", "whatsapp_replaced", "whatsapp_not_started", "whatsapp_mismatch"],
  ai: ["ai_auth", "ai_outage"],
  overflow: ["ai_overflow"],
} as const satisfies Record<(typeof ALERT_GROUP_IDS)[number], readonly string[]>; // one entry per id the API accepts
export type AlertGroup = keyof typeof ALERT_GROUPS;

/** Whether an alert of this cause is emailed, given the groups turned off. Turned-off alerts still show in the app. */
export function alertEmailed(cause: string, off: readonly string[]) {
  return !off.some((g) => (ALERT_GROUPS as Record<string, readonly string[]>)[g]?.includes(cause));
}
