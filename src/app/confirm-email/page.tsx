// The page the confirmation email links to (#82). It changes nothing until the button is pressed, so a mail scanner
// opening the link can't confirm the address.
import { ConfirmEmail } from "./confirm-email";

export const metadata = { title: "Confirm your email · Course-manager" };
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold">Confirm your email</h1>
      <ConfirmEmail token={token ?? ""} />
    </main>
  );
}
