// The link in the confirmation email (#82). It works signed out (it may be opened on another device): the token is
// the proof. Always redirects to Settings, which says whether it worked.
import { confirmEmail } from "@/server/data/email-settings";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = token.length >= 20 && token.length <= 100 && (await confirmEmail(token));
  return new Response(null, { status: 303, headers: { location: `${process.env.APP_ORIGIN ?? ""}/settings?email=${ok ? "confirmed" : "link-invalid"}#email` } });
}
