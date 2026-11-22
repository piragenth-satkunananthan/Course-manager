"use client";
// The two halves of a password reset (#17), through Better Auth: ask for the link, then set the new password.
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ErrorSummary, SaveButton, TextField, useAppForm } from "@/components/app/form";
import { authClient } from "@/lib/auth-client";
import { NewPassword, ResetRequest } from "@/shared/schemas/account";

const Done = ({ children }: { children: React.ReactNode }) => (
  <p role="status" className="mt-6 flex items-start gap-2 rounded-sm bg-success-subtle p-3 text-sm font-medium text-success">
    <CircleCheck size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
    <span>{children}</span>
  </p>
);

export function ResetRequestForm() {
  const form = useAppForm(ResetRequest, { email: "" });
  const [sent, setSent] = useState(false);
  const { errors, submitCount, isSubmitting } = form.formState;
  async function onSubmit({ email }: { email: string }) {
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    // The same reply whether or not the email exists; only the rate limit is said out loud.
    if (error?.status === 429) return form.setError("root", { message: "Too many attempts, try again in a minute" });
    setSent(true);
  }
  if (sent) return <Done>If the email exists, a link has been sent. It works for 1 hour.</Done>;
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ email: "Email" }} />
      <TextField control={form.control} name="email" label="Email" type="email" autoComplete="username" required />
      <SaveButton pending={isSubmitting} className="w-full">Email me a link</SaveButton>
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  const form = useAppForm(NewPassword, { newPassword: "" });
  const [done, setDone] = useState(false);
  const { errors, submitCount, isSubmitting } = form.formState;
  async function onSubmit({ newPassword }: { newPassword: string }) {
    const { error } = await authClient.resetPassword({ newPassword, token });
    if (error?.code === "INVALID_TOKEN") return form.setError("root", { message: "That link has expired or was already used. Ask for a new one below." });
    if (error) return form.setError("root", { message: "Couldn't set the password. Try again." });
    setDone(true);
  }
  if (done)
    return (
      <>
        <Done>Your password was changed, and every device was signed out.</Done>
        <Link href="/login" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline md:min-h-10">Sign in</Link>
      </>
    );
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6 space-y-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ newPassword: "New password" }} />
      <TextField control={form.control} name="newPassword" label="New password" type="password" autoComplete="new-password" required help="At least 12 characters" />
      <SaveButton pending={isSubmitting} className="w-full">Set new password</SaveButton>
      {errors.root && <Link href="/reset-password" className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline md:min-h-10">Ask for a new link</Link>}
    </form>
  );
}
