"use client";
// Settings → Account (#17): sign out, change password (other devices are signed out), and the danger zone.
import { KeyRound, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { authClient } from "@/lib/auth-client";
import { AccountDelete, ChangePassword } from "@/shared/schemas/account";
import { applyServerError, ErrorSummary, SaveButton, TextField, useAppForm } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const form = useAppForm(ChangePassword, { currentPassword: "", newPassword: "" });
  const { errors, submitCount, isSubmitting } = form.formState;
  async function onSubmit(values: { currentPassword: string; newPassword: string }) {
    const { error } = await authClient.changePassword({ ...values, revokeOtherSessions: true });
    if (error?.status === 400) return form.setError("currentPassword", { message: "That password isn't right" });
    if (error) return form.setError("root", { message: "Couldn't change the password. Try again." });
    toast.success("Password changed. Other devices were signed out.");
    onDone();
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ currentPassword: "Current password", newPassword: "New password" }} />
      <TextField control={form.control} name="currentPassword" label="Current password" type="password" autoComplete="current-password" required />
      <TextField control={form.control} name="newPassword" label="New password" type="password" autoComplete="new-password" required help="At least 12 characters" />
      <div className="flex justify-end">
        <SaveButton pending={isSubmitting} className="max-md:w-full">Change password</SaveButton>
      </div>
    </form>
  );
}

function DeleteAccountForm() {
  const router = useRouter();
  const form = useAppForm(AccountDelete, { password: "" });
  const { errors, submitCount, isSubmitting } = form.formState;
  async function onSubmit(body: { password: string }) {
    const res = await apiFetch("/account/delete", { method: "POST", body });
    if (!res.ok) return applyServerError(form, res.error);
    await authClient.signOut().catch(() => undefined); // the session row is already gone; this clears the cookie
    router.replace("/login");
    router.refresh();
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ password: "Password" }} />
      <p className="text-sm">
        This deletes your Semesters, Courses, timetable, Assignments, Exams, the stored WhatsApp messages and the Activity Log, and unlinks WhatsApp. It can&apos;t be undone. Backups age out within 7 days. You&apos;ll get a confirmation email.
      </p>
      <TextField control={form.control} name="password" label="Your password" type="password" autoComplete="current-password" required />
      <div className="flex justify-end">
        <Button type="submit" variant="destructive" disabled={isSubmitting} className="max-md:w-full">
          <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
          Delete my account
        </Button>
      </div>
    </form>
  );
}

export function AccountSection({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState<"password" | "delete" | null>(null);
  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <>
      <section aria-labelledby="account-heading" className="rounded-md border border-border bg-card p-4 md:p-6">
        <h2 id="account-heading" className="text-title font-semibold">Account</h2>
        <p className="mt-2 text-sm text-muted-foreground">Signed in as</p>
        <p className="break-all">{email}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setOpen("password")}>
            <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
            Change password
          </Button>
          <Button variant="outline" onClick={signOut} disabled={pending}>
            <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </section>
      <section aria-labelledby="danger-heading" className="rounded-md border border-destructive/40 bg-card p-4 md:p-6">
        <h2 id="danger-heading" className="text-title font-semibold">Danger zone</h2>
        <Button variant="outline" className="mt-4 border-destructive text-destructive hover:bg-destructive-subtle" onClick={() => setOpen("delete")}>
          <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
          Delete my account
        </Button>
      </section>
      <ResponsiveDialog open={open === "password"} onOpenChange={(o) => !o && setOpen(null)} title="Change password">
        <ChangePasswordForm onDone={() => setOpen(null)} />
      </ResponsiveDialog>
      <ResponsiveDialog open={open === "delete"} onOpenChange={(o) => !o && setOpen(null)} title="Delete your account?">
        <DeleteAccountForm />
      </ResponsiveDialog>
    </>
  );
}
