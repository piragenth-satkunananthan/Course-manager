// Seam: Possibly Missed messages and Unknown Courses in the Activity Log, at phone and desktop sizes (#14).
import { expect, test } from "@playwright/test";
import { auditLayout, seedAutoChange, seedCourse, signIn } from "./helpers";

test("a Possibly Missed message pre-fills Add and can be dismissed; an Unknown Course is linked or added", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "CTP" : "CTD";
  const missed = (title: string) => seedAutoChange(courseId, title, shift(4), undefined, "missed");
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  missed(`${code} practical report`);
  missed(`${code} chatter`);
  seedAutoChange(courseId, `${code}N`, shift(5), undefined, "unknown");
  seedAutoChange(courseId, `${code}A`, shift(6), undefined, "unknown");

  await page.goto("/activity");
  const report = page.getByRole("listitem").filter({ hasText: "Possibly missed" }).filter({ hasText: `${code} practical report` });
  await expect(report).toContainText("This Course has no Practical Course");
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);

  // Add Practical Course opens the Course form with "Practical of" set
  await report.getByRole("button", { name: "Add Practical Course" }).click();
  const courseDialog = page.getByRole("dialog", { name: "New Practical Course" });
  await expect(courseDialog.getByLabel("Practical of")).toContainText(code);
  await page.keyboard.press("Escape");

  // Add Assignment: Course and description pre-filled; saving removes the item
  await report.getByRole("button", { name: "Add Assignment" }).click();
  const form = page.getByRole("dialog", { name: "New Assignment" });
  await expect(form.getByLabel("Course (required)")).toContainText(code);
  await expect(form.getByLabel("Description")).toHaveValue(`${code} practical report due ${shift(4)}`);
  await form.getByLabel("Title (required)").fill(`${code} Practical report`);
  await form.getByLabel("Due date (required)").fill(shift(4));
  await form.getByRole("button", { name: "Save Assignment" }).click();
  await expect(report).toHaveCount(0);

  // Dismiss
  const chatter = page.getByRole("listitem").filter({ hasText: `${code} chatter` });
  await chatter.getByRole("button", { name: "Dismiss" }).click();
  await expect(chatter).toHaveCount(0);

  // Nickname of… an existing Course applies the waiting change
  const nick = page.getByRole("listitem").filter({ hasText: `Unknown Course: ${code}N` });
  await expect(nick).toContainText("1 change waiting");
  await nick.getByRole("button", { name: "Nickname of…" }).click();
  const which = page.getByRole("dialog", { name: `Which Course is "${code}N"?` });
  await which.getByLabel("Course (required)").click();
  await page.getByRole("option", { name: `${code} Data Structures` }).click();
  await which.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("1 change applied.")).toBeVisible();
  await expect(nick).toContainText("Linked to a Course");

  // Add course creates it in the current Semester and applies the change
  const add = page.getByRole("listitem").filter({ hasText: `Unknown Course: ${code}A` });
  await add.getByRole("button", { name: "Add course" }).click();
  const addDialog = page.getByRole("dialog", { name: `Add "${code}A" as a Course` });
  await expect(addDialog.getByLabel("Code (required)")).toHaveValue(`${code}A`);
  await addDialog.getByRole("radio", { name: "Pink" }).click();
  await addDialog.getByRole("button", { name: "Add Course" }).click();
  await expect(add).toContainText("Added as a Course");

  const titles = (await (await page.request.get("/api/v1/assignments")).json()).map((x: { title: string }) => x.title);
  expect(titles).toEqual(expect.arrayContaining([`${code} Practical report`, `${code}N essay`, `${code}A essay`]));
});
