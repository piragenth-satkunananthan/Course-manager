import Link from "next/link";
import { NewPasswordForm, ResetRequestForm } from "./reset-forms";

// Reset password (design-system §7.7): the request form, or with the emailed link's token, the new-password form.
// Better Auth sends an expired or used link here with ?error=INVALID_TOKEN.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pt-16">
      <div className="w-full max-w-[400px] rounded-md border border-border bg-card p-6">
        <h1 className="text-display font-bold max-md:text-2xl">Reset password</h1>
        {token && !error ? (
          <NewPasswordForm token={token} />
        ) : (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              {error ? "That link has expired or was already used. Ask for a new one." : "We'll email you a link to set a new password."}
            </p>
            <ResetRequestForm />
          </>
        )}
        <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline md:min-h-10">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
