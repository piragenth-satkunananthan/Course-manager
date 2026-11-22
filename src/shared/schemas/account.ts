import * as z from "zod";

export const AccountDelete = z.strictObject({ password: z.string().min(1, "Enter your password") });
export type AccountDelete = z.output<typeof AccountDelete>;

const newPassword = z.string().min(12, "Use at least 12 characters").max(128, "Use at most 128 characters");
export const ResetRequest = z.strictObject({ email: z.email({ error: "Enter your email" }) });
export const NewPassword = z.strictObject({ newPassword });
export const ChangePassword = z.strictObject({ currentPassword: z.string().min(1, "Enter your current password"), newPassword });
