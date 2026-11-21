import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await auth.api.getSession({ headers: await headers() })) redirect("/");
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 pt-16">
      <div className="w-full max-w-[400px] rounded-md border border-border bg-card p-6">
        <h1 className="text-display font-bold max-md:text-2xl">Course-manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to see what&apos;s due.</p>
        <LoginForm />
      </div>
    </main>
  );
}
