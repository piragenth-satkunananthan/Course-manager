// One-off: creates the single Student account (design file 66). Public sign-up is disabled.
//   node dist/create-student.js                       prompts for email and password
//   node dist/create-student.js --email a@b --password …   non-interactive (tests, seeding)
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { parseArgs } from "node:util";
import { auth } from "@/server/auth";
import { pool } from "@/server/db/client";

export async function createStudent(email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("That doesn't look like an email address");
  if (password.length < 12) throw new Error("The password must be at least 12 characters");
  const ctx = await auth.$context;
  if ((await ctx.adapter.count({ model: "user" })) > 0) throw new Error("A Student account already exists; v1 has one Student");
  // internalAdapter is the path Better Auth's own admin createUser uses; disableSignUp doesn't block it.
  const user = await ctx.internalAdapter.createUser({ email, name: "Student", emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
  return user;
}

async function prompt(question: string, hidden = false) {
  let muted = false;
  const output = new Writable({ write: (chunk, _enc, cb) => (muted || process.stdout.write(chunk), cb()) });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const answer = rl.question(question);
  muted = hidden;
  const value = await answer;
  rl.close();
  if (hidden) process.stdout.write("\n");
  return value;
}

if (process.argv[1]?.match(/create-student\.(ts|js)$/)) {
  const { values } = parseArgs({ options: { email: { type: "string" }, password: { type: "string" } } });
  try {
    const email = values.email ?? (await prompt("Email: "));
    const password = values.password ?? (await prompt("Password (at least 12 characters): ", true));
    const user = await createStudent(email, password);
    console.log(`Created the Student account for ${user.email}`);
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
