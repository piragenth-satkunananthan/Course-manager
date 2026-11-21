// Seam: the Semester, Course and Nickname forms in a browser, at phone and desktop sizes (#6).
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const summary = (page: import("@playwright/test").Page) => page.getByRole("alert").filter({ hasText: /\S/ });

test("add a Semester, a Course and a Nickname, with inline errors and a focused summary", async ({ page }, info) => {
  const tag = info.project.name === "phone" ? "P" : "D";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  // Semester, in Settings
  await page.goto("/settings");
  await page.getByRole("button", { name: "Add Semester" }).click();
  const semesterForm = page.getByRole("dialog", { name: "Add Semester" });
  await semesterForm.getByRole("button", { name: "Add Semester" }).click();
  await expect(summary(page)).toBeFocused();
  await expect(semesterForm.getByLabel("Name (required)")).toHaveAccessibleDescription("Enter a name");
  await semesterForm.getByLabel("Name (required)").fill(`Semester ${tag}`);
  await semesterForm.getByLabel("Start date (required)").fill("2026-08-03");
  await semesterForm.getByLabel("End date (required)").fill("2026-12-18");
  await semesterForm.getByRole("button", { name: "Add Semester" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText(`Semester ${tag}`)).toBeVisible();

  // Course, from the Courses page
  await page.goto("/courses");
  await page.getByRole("button", { name: "Add Course" }).click();
  const courseForm = page.getByRole("dialog", { name: "Add Course" });
  await courseForm.getByLabel("Code (required)").fill(`${tag}2010`);
  await courseForm.getByRole("button", { name: "Add Course" }).click();
  await expect(summary(page)).toBeFocused();
  await expect(courseForm.getByLabel("Name (required)")).toHaveAccessibleDescription("Enter the Course name");
  await courseForm.getByLabel("Name (required)").fill("Data Structures");
  await courseForm.getByRole("radio", { name: "Violet" }).click();
  await courseForm.getByRole("button", { name: "Add Course" }).click();
  const row = page.getByRole("link", { name: new RegExp(`${tag}2010 Data Structures`) });
  await expect(row).toBeVisible();

  // Nickname, on the Course page
  await row.click();
  await expect(page.getByRole("heading", { level: 1, name: `${tag}2010` })).toBeVisible();
  await page.getByLabel("Add a nickname").fill("DS");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const chip = page.getByRole("list", { name: "Nicknames" }).getByRole("listitem");
  await expect(chip).toHaveText("ds");
  await page.getByRole("button", { name: "Remove ds" }).click();
  await expect(page.getByText("No nicknames yet.")).toBeVisible();
});
