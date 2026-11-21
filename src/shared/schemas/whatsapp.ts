import * as z from "zod";
import { Id } from "./common";

/** Digits with the country code, e.g. 94771234567; spaces, dashes and a leading + are dropped. */
export const PairingRequest = z.strictObject({
  phone: z
    .string()
    .transform((p) => p.replace(/[\s\-()+]/g, ""))
    .pipe(z.string().regex(/^[1-9]\d{9,14}$/, "Use digits with the country code, e.g. 94771234567")),
});
export type PairingRequest = z.output<typeof PairingRequest>;

export const GroupLink = z.union([z.strictObject({ courseId: Id }), z.strictObject({ semesterId: Id })], { error: "Link to one Course or to the Semester" });
export type GroupLink = z.output<typeof GroupLink>;

export const WaGroup = z.object({ id: Id, subject: z.string(), linkedCourseId: Id.nullable(), linkedSemesterId: Id.nullable() });
export type WaGroup = z.infer<typeof WaGroup>;
export const WhatsAppStatus = z.object({
  status: z.enum(["unlinked", "pairing", "connected", "logged_out", "error"]),
  pairingCode: z.string().nullable(),
  lastError: z.string().nullable(),
  lastEventAt: z.string().nullable(),
  groups: z.array(WaGroup),
});
export type WhatsAppStatus = z.infer<typeof WhatsAppStatus>;
