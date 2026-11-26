"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmEmail({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">("idle");
  const [message, setMessage] = useState("");
  async function confirm() {
    setState("busy");
    const res = await fetch("/api/v1/email-confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) }).catch(() => null);
    if (res?.ok) return setState("done");
    setMessage(((await res?.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "Couldn't reach the server. Try again.");
    setState("failed");
  }
  if (state === "done")
    return (
      <p role="status">
        Email confirmed. Reminders, digests and alerts now go there.{" "}
        <Link href="/settings#email" className="font-semibold text-primary underline">
          Open Settings
        </Link>
      </p>
    );
  return (
    <>
      <p>Press Confirm to get Course-manager&apos;s reminders, digests and alerts at this address.</p>
      {state === "failed" && (
        <p role="alert" className="text-destructive">
          {message}
        </p>
      )}
      <Button onClick={confirm} disabled={state === "busy" || !token} className="w-full">
        Confirm
      </Button>
    </>
  );
}
