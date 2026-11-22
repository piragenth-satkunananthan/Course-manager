// Seam: Settings → WhatsApp in a browser at phone and desktop sizes (#11). No worker runs here, so the test plays
// its part in the database: it writes the pairing code, then the connected status and the groups.
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "../tests/test-db";
import { auditLayout, seedCourse, signIn } from "./helpers";

test("pair with a code, link a group to a Course, and see the banner after a logout", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "WAP1" : "WAD1";
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await seedCourse(page, code); // the newest Semester isn't current, so make it current below
  const studentId = (await pool.query("select id from \"user\" where email = 'student@example.com'")).rows[0].id;
  // Two steps: the one-current index is checked row by row, so a single swap can collide.
  await pool.query("update semester set is_current = false where student_id = $1", [studentId]);
  await pool.query("update semester set is_current = true where student_id = $1 and name = $2", [studentId, `Sem ${code}`]);
  await pool.query("update wa_session set status = 'unlinked', pairing_code = null, last_error = null where student_id = $1", [studentId]);

  await page.goto("/settings#whatsapp");
  const section = page.getByRole("region", { name: "WhatsApp" });
  await expect(section.getByText("Not connected")).toBeVisible();

  // Validation
  await section.getByLabel("Phone number (required)").fill("0771234");
  await section.getByRole("button", { name: "Get pairing code" }).click();
  await expect(section.getByLabel("Phone number (required)")).toHaveAccessibleDescription("Use digits with the country code, e.g. 94771234567");

  // Pairing: the code appears once the worker writes it (polled every 2 s), with a countdown
  await section.getByLabel("Phone number (required)").fill("+94 77 123 4567");
  await section.getByRole("button", { name: "Get pairing code" }).click();
  await expect(section.getByText("Getting a code…")).toBeVisible();
  await expect(section.getByText(/left$/)).toBeVisible();
  await pool.query("update wa_session set pairing_code = 'ABCD1234' where student_id = $1", [studentId]);
  await expect(section.getByText("ABCD1234")).toBeVisible({ timeout: 5000 });
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);

  // Linking completes: groups appear; link one to the Course
  await pool.query("insert into wa_group (student_id, wa_jid, subject) values ($1, $2, $3) on conflict do nothing", [studentId, `${code}@g.us`, `${code} group`]);
  await pool.query("update wa_session set status = 'connected', pairing_code = null where student_id = $1", [studentId]);
  await expect(section.getByText("Connected")).toBeVisible({ timeout: 5000 });
  await section.getByLabel(`${code} group`).click();
  await page.getByRole("option", { name: `${code} Data Structures` }).click();
  await expect(page.getByText(`${code} group is linked`)).toBeVisible();
  const linked = (await pool.query("select linked_course_id is not null as linked from wa_group where wa_jid = $1", [`${code}@g.us`])).rows[0];
  expect(linked.linked).toBe(true);

  // A group named after the Course code suggests it, but stays unlinked until confirmed (#26)
  const named = `${code}/(22/23)`;
  await pool.query("insert into wa_group (student_id, wa_jid, subject) values ($1, $2, $3) on conflict do nothing", [studentId, `${code}-n@g.us`, named]);
  await page.reload();
  const suggestion = section.getByRole("button", { name: `Link to ${code}` });
  await expect(suggestion).toBeVisible();
  const unlinked = async () => (await pool.query("select linked_course_id is null as v from wa_group where wa_jid = $1", [`${code}-n@g.us`])).rows[0].v;
  expect(await unlinked()).toBe(true);
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await suggestion.click();
  await expect(page.getByText(`${named} is linked`)).toBeVisible();
  expect(await unlinked()).toBe(false);
  await expect(suggestion).toBeHidden();

  // A logout shows the banner with Re-link on every page
  await pool.query("update wa_session set status = 'logged_out', disconnected_at = now() where student_id = $1", [studentId]);
  await page.goto("/");
  const banner = page.getByRole("status").filter({ hasText: "WhatsApp disconnected since" });
  await expect(banner).toContainText("New announcements aren't being read.");
  await banner.getByRole("link", { name: "Re-link" }).click();
  await expect(page).toHaveURL(/\/settings#whatsapp$/);
  await pool.query("update wa_session set status = 'unlinked', disconnected_at = null where student_id = $1", [studentId]);
  await pool.end();
});
