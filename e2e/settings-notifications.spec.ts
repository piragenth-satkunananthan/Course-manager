// Settings: the section list and Notifications (#79, U44) at phone and desktop sizes.
import { expect, type Page, test } from "@playwright/test";
import { auditLayout, signIn } from "./helpers";

const pick = async (page: Page, label: string, option: string) => {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
};

test("Notifications: the section list, saving, a clash with quiet hours, and Reset to default", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/settings");

  // The section list jumps to each section
  const list = page.getByRole("navigation", { name: "Settings sections" });
  for (const name of ["Notifications", "Semesters", "WhatsApp", "Account"]) await expect(list.getByRole("link", { name })).toBeVisible();
  await list.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/#account$/);
  await expect(page.getByRole("heading", { level: 2, name: "Account" })).toBeInViewport();

  // Today's behaviour is the default
  const section = page.getByRole("region", { name: "Notifications" });
  await expect(section.getByRole("combobox", { name: "Daily Digest" })).toHaveText("At 07:00");
  await expect(section.getByRole("combobox", { name: "Final Reminder" })).toHaveText("4 hours before");
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });

  // Save new choices; they stay after a reload
  await pick(page, "Daily Digest", "At 06:30");
  await pick(page, "Final Reminder", "1 day before");
  await pick(page, "Second reminder", "1 week before");
  await section.getByRole("button", { name: "Save notifications" }).click();
  await expect(page.getByText("Notifications saved")).toBeVisible();
  await page.reload();
  await expect(section.getByRole("combobox", { name: "Daily Digest" })).toHaveText("At 06:30");
  await expect(section.getByRole("combobox", { name: "Second reminder" })).toHaveText("1 week before");

  // The digest can't be sent during quiet hours: the summary and the field say why, nothing is saved
  await pick(page, "Quiet hours start", "06:00");
  await pick(page, "Quiet hours end", "08:00");
  await section.getByRole("button", { name: "Save notifications" }).click();
  const summary = page.getByRole("alert").filter({ hasText: /\S/ });
  await expect(summary).toContainText("The digest can't be sent during quiet hours");
  await expect(section.getByRole("combobox", { name: "Daily Digest" })).toHaveAccessibleDescription("The digest can't be sent during quiet hours");
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-settings-notifications.png`, fullPage: true });

  // Reset to default puts everything back
  await section.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.getByText("Notifications saved")).toBeVisible();
  await page.reload();
  await expect(section.getByRole("combobox", { name: "Daily Digest" })).toHaveText("At 07:00");
  await expect(section.getByRole("combobox", { name: "Quiet hours start" })).toHaveText("Off");
  await expect(section.getByRole("combobox", { name: "Second reminder" })).toHaveText("Off");
});
