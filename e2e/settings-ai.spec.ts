// Settings → AI (#80) at phone and desktop sizes: the status and "Test AI now" (against the e2e fake NIM).
import { expect, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, signIn } from "./helpers";

test("the AI section shows its status and Test AI now answers", async ({ page }, info) => {
  // A different Student per size: the 10-second limit is per Student.
  if (info.project.name === "phone") await signIn(page);
  else await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "AI" }).click();
  const ai = page.getByRole("region", { name: "AI" });
  await expect(ai).toBeInViewport();
  // No worker runs in e2e, so the AI loop has never started on this database.
  await expect(ai.getByText("Stopped")).toBeVisible();
  await expect(ai.getByRole("combobox", { name: "Model" })).toHaveText("nvidia/e2e-model");
  await ai.getByRole("button", { name: "Test AI now" }).click();
  await expect(ai.getByRole("status")).toHaveText(/^Working: answered in \d+\.\d s$/);
  expect(await auditLayout(page, info.project.name === "phone" ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-settings-ai.png`, fullPage: true });
});
