"use client";
// Root error boundary (design file 53). Shows Next's digest so a log line can be found.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-prose px-4 py-12">
      <h1 className="text-title font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted-foreground">Try again. If it keeps happening, note this reference: {error.digest ?? "none"}.</p>
      <button onClick={reset} className="mt-6 min-h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover md:min-h-10">
        Try again
      </button>
    </main>
  );
}
