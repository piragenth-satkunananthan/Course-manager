// Settings → Defaults (#83, U47) at phone and desktop sizes: 12-hour times and a Sunday week start show across the app.
import { expect, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, seedCourse, signIn } from "./helpers";

test("12-hour times and weeks from Sunday, then back to the defaults", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await signIn(page);
  else await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, phone ? "DFP" : "DFD");
  const H = { origin: new URL(page.url()).origin };
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: "Afternoon work", dueDate: shift(3), dueTime: "14:30" } });

  await page.goto("/settings#defaults");
  const s = page.getByRole("region", { name: "Defaults" });
  const pick = async (label: string, option: string) => {
    await s.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option }).click();
  };
  await pick("Time format", "12-hour (2:00 pm)");
  await pick("Week starts on", "Sunday");
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
  await s.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByText("Defaults saved")).toBeVisible();

  await page.goto("/assignments");
  await expect(page.getByText(/Due .*, 2:30 pm/)).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("columnheader").first()).toHaveText("Sun");
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-defaults-12h-sunday.png`, fullPage: true });

  await page.goto("/settings#defaults");
  await pick("Time format", "24-hour (14:00)");
  await pick("Week starts on", "Monday");
  await s.getByRole("button", { name: "Save defaults" }).click();
  await expect(page.getByText("Defaults saved")).toBeVisible();
  await page.goto("/calendar");
  await expect(page.getByRole("columnheader").first()).toHaveText("Mon");
});
