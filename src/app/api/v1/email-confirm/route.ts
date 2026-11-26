// Confirming an email address (#82): the Confirm button on /confirm-email posts the token from the link. It works
// signed out (the link may be opened on another device): the token is the proof.
import * as z from "zod";
import { confirmEmail } from "@/server/data/email-settings";

const Body = z.object({ token: z.string().min(20).max(100) });
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  const ok = body.success && (await confirmEmail(body.data.token));
  return Response.json(ok ? { confirmed: true } : { error: { code: "VALIDATION", message: "This link has expired or was already used. Ask for a new one in Settings." } }, { status: ok ? 200 : 400 });
}
