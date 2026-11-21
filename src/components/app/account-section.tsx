"use client";
// Settings → Account. Change password and account deletion join here with #17.
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function AccountSection({ email }: { email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <section aria-labelledby="account-heading" className="rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="account-heading" className="text-title font-semibold">Account</h2>
      <p className="mt-2 text-sm text-muted-foreground">Signed in as</p>
      <p className="break-all">{email}</p>
      <Button variant="outline" className="mt-4" onClick={signOut} disabled={pending}>
        <LogOut size={20} strokeWidth={1.75} aria-hidden="true" />
        Sign out
      </Button>
    </section>
  );
}
