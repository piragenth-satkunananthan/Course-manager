// Seam: Undo batch and the Activity Log's filter chips and event items (#22), at phone and desktop sizes.
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "../tests/test-db";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, seedAutoChange, seedCourse, signIn } from "./helpers";

test("Undo batch undoes what it can and says what it skipped; chips filter the log; events are listed", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "UBP" : "UBD";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  seedAutoChange(courseId, `${code} lab`, shift(5), undefined, "batch"); // one message, two Assignments

  // The Student edits B afterwards: Undo batch must skip it
  const H = { origin: new URL(page.url()).origin };
  const b = (await (await page.request.get("/api/v1/assignments")).json()).find((x: { title: string }) => x.title === `${code} lab B`);
  await page.request.patch(`/api/v1/assignments/${b.id}`, { headers: H, data: { expectedVersion: b.version, title: `${code} lab B (mine)` } });

  await page.goto("/activity?filter=changes");
  await expect(page.getByRole("radiogroup", { name: "Show" }).getByRole("radio", { name: "Changes" })).toBeChecked();
  const itemA = page.getByRole("listitem").filter({ hasText: `${code} lab A: due` });
  await expect(itemA.getByRole("button", { name: "Undo batch (2)" })).toBeVisible();
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });

  await itemA.getByRole("button", { name: "Undo batch (2)" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Undo all 2 changes from this batch?" });
  await confirm.getByRole("button", { name: "Undo 2 changes" }).click();
  await expect(page.getByText("Undid 1 change; skipped 1")).toBeVisible();
  await expect(page.getByText(new RegExp(`${code} lab B: due .*: You edited this after the change`))).toBeVisible();
  await expect(itemA.getByText("Undone", { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-undo-batch.png`, fullPage: true });
  const titles = (await (await page.request.get("/api/v1/assignments")).json()).map((x: { title: string }) => x.title);
  expect(titles).toContain(`${code} lab B (mine)`);
  expect(titles).not.toContain(`${code} lab A`);

  // Needs attention: events, not changes
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  const studentId = (await pool.query("select id from \"user\" where email = 'student@example.com'")).rows[0].id;
  await pool.query("insert into activity_event (student_id, kind, payload) values ($1, 'stuck_messages', $2), ($1, 'file_too_large', $3)", [studentId, { count: 3 }, { fileName: `${code}-notes.pdf` }]);
  await pool.end();
  await page.getByRole("radiogroup", { name: "Show" }).getByRole("radio", { name: "Needs attention" }).click();
  await expect(page).toHaveURL(/\/activity\?filter=attention$/);
  await expect(page.getByText("3 messages waited too long for the AI.", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(`"${code}-notes.pdf" is over 20 MB, so it wasn't saved.`, { exact: false })).toBeVisible();
  await expect(page.getByText(`${code} lab A: due`)).toHaveCount(0);
  await page.getByRole("radiogroup", { name: "Show" }).getByRole("radio", { name: "All" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByText(`${code} lab A: due`)).toBeVisible();
});

test("each filter has its own empty state", async ({ page }) => {
  await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/activity?filter=attention");
  await expect(page.getByText("Nothing needs your attention.", { exact: false })).toBeVisible();
  await page.goto("/activity?filter=changes");
  await expect(page.getByText("No Auto Changes yet.", { exact: false })).toBeVisible();
});
