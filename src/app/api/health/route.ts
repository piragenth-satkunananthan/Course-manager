// Liveness for deploys (design file 50). No auth.
import { pool } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("select 1");
    return Response.json({ db: "ok" });
  } catch {
    return Response.json({ db: "down" }, { status: 503 });
  }
}
