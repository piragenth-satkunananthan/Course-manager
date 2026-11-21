// Seam: Assignments and Exams on the dashboard, in a browser at phone and desktop sizes (#7).
import { expect, test } from "@playwright/test";
import { seedCourse, signIn } from "./helpers";

test("add an untimed Assignment, see it due soon, and mark it Submitted", async ({ page }, info) => {
  const code = `${info.project.name === "phone" ? "P" : "D"}3001`;
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  const H = { origin: new URL(page.url()).origin };
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: `Overdue ${code}`, dueDate: shift(-1) } });
  await page.request.post("/api/v1/exams", { headers: H, data: { courseId, title: `Final ${code}` } });
  await page.reload();

  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Assignment" }).click();
  const form = page.getByRole("dialog", { name: "New Assignment" });
  await form.getByLabel("Course (required)").click();
  await page.getByRole("option", { name: new RegExp(code) }).click();
  await form.getByLabel("Title (required)").fill(`Lab report ${code}`);
  await form.getByLabel("Due date (required)").fill(shift(3));
  await form.getByRole("button", { name: "Save Assignment" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  const soon = page.getByRole("region", { name: "Due soon (next 14 days)" });
  const row = soon.getByRole("listitem").filter({ hasText: `Lab report ${code}` });
  await expect(row).toContainText("time not announced");
  await expect(row).toContainText("in 3 days");

  // Overdue is listed before Due soon, with an icon and the word
  const overdue = page.getByRole("region", { name: /^Overdue/ }).getByRole("listitem").filter({ hasText: `Overdue ${code}` });
  await expect(overdue).toContainText("Overdue");
  // The TBA Exam sits in its own section
  await page.getByText(/Exams with date TBA/).click();
  await expect(page.getByText(`Final ${code}`)).toBeVisible();

  await row.getByRole("checkbox", { name: `Mark Lab report ${code} submitted` }).click();
  await expect(page.getByText(`Marked Lab report ${code} submitted`)).toBeVisible();
  await expect(soon.getByText(`Lab report ${code}`)).toHaveCount(0);
});

test("an edit that lost a race reloads the latest values with a toast", async ({ page }, info) => {
  const code = `${info.project.name === "phone" ? "P" : "D"}3002`;
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  const H = { origin: new URL(page.url()).origin };
  const item = await (await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: `Essay ${code}`, dueDate: shift(2) } })).json();
  await page.reload();

  await page.getByRole("button", { name: new RegExp(`Essay ${code}`) }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  // Meanwhile, something else changes it (in the app, the AI).
  await page.request.patch(`/api/v1/assignments/${item.id}`, { headers: H, data: { expectedVersion: 1, title: `Essay ${code} (v2)` } });

  const form = page.getByRole("dialog", { name: "Edit Assignment" });
  await form.getByLabel("Title (required)").fill(`Essay ${code} mine`);
  await form.getByRole("button", { name: "Save Assignment" }).click();
  await expect(page.getByText("This item just changed. It has been reloaded with the latest values.")).toBeVisible();
  await expect(form.getByLabel("Title (required)")).toHaveValue(`Essay ${code} (v2)`);
});
