// Settings → Dashboard (#84, U47) at phone and desktop sizes: the range and the sections' order and visibility.
import { expect, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, seedCourse, signIn } from "./helpers";

test("change Due soon's range, move and hide sections, and reset", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  if (phone) await signIn(page);
  else await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await seedCourse(page, phone ? "DBP" : "DBD"); // the dashboard needs a Course to show its sections
  await page.goto("/settings#dashboard");
  const section = page.getByRole("region", { name: "Dashboard" });
  await expect(section.getByRole("checkbox", { name: "Overdue (always shown)" })).toBeDisabled();

  await section.getByRole("combobox", { name: "Due soon covers" }).click();
  await page.getByRole("option", { name: "The next 7 days" }).click();
  await section.getByRole("button", { name: "Move Due soon up" }).click();
  await section.getByRole("button", { name: "Move Due soon up" }).click();
  await section.getByRole("checkbox", { name: "Today" }).click();
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
  await section.getByRole("button", { name: "Save dashboard" }).click();
  await expect(page.getByText("Dashboard saved")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Due soon (next 7 days)" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Today/ })).toHaveCount(0);
  const order = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(order[0]).toBe("Due soon (next 7 days)");
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-dashboard-custom.png`, fullPage: true });

  await page.goto("/settings#dashboard");
  await section.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByText("Dashboard saved")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Due soon (next 14 days)" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Today/ })).toBeVisible();
});
