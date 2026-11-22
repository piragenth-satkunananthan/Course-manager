// Seam: pausing Auto Changes from Settings, the paused banner on every page, and Resume, at phone and desktop sizes (#15).
import { expect, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, signIn } from "./helpers";

test("pause Auto Changes in Settings, see the banner everywhere, and Resume from it", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const banner = page.getByRole("status").filter({ hasText: "Auto Changes are paused." });
  await expect(banner).toHaveCount(0);

  await page.goto("/settings");
  const toggle = page.getByRole("switch", { name: "Auto Changes" });
  await expect(toggle).toBeChecked();
  await expect(toggle).toHaveAccessibleDescription("On: the AI applies changes from your WhatsApp groups, each with Undo.");
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);

  // Pause, with the keyboard
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Auto Changes paused", { exact: true })).toBeVisible();
  await expect(toggle).not.toBeChecked();
  await expect(toggle).toHaveAccessibleDescription(/^Paused: messages keep arriving and wait/);
  await expect(banner).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-settings-paused.png`, fullPage: true });

  // The banner shows on other pages, and Resume clears it
  await page.goto("/courses");
  await expect(banner).toBeVisible();
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await banner.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText("Auto Changes resumed", { exact: true })).toBeVisible();
  await expect(banner).toHaveCount(0);
  await page.goto("/settings");
  await expect(page.getByRole("switch", { name: "Auto Changes" })).toBeChecked();
});
