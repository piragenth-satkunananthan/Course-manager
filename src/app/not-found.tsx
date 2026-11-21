import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-prose px-4 py-12">
      <h1 className="text-title font-semibold">Page not found</h1>
      <p className="mt-2 text-muted-foreground">This page doesn&apos;t exist yet.</p>
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
