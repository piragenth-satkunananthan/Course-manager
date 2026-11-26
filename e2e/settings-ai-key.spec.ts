// Settings → AI key and model (#81, U45) at phone and desktop sizes, against the e2e fake NIM.
import { expect, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, signIn } from "./helpers";

test("paste a key (a refused one isn't saved), see it masked, change the model and switch back, use the server's key", async ({ page }, info) => {
  if (info.project.name === "phone") await signIn(page);
  else await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/settings#ai");
  const ai = page.getByRole("region", { name: "AI" });
  await expect(ai.getByText("The server's key")).toBeVisible();
  await expect(ai.getByText("••••_e2e")).toBeVisible();

  // A refused key: the field says so and nothing changes
  const field = ai.getByLabel("New NVIDIA API key");
  await field.fill("nvapi-bad-key-0000");
  await ai.getByRole("button", { name: "Save key" }).click();
  await expect(ai.getByRole("alert").filter({ hasText: "NVIDIA refused this key" })).toBeVisible();
  await expect(ai.getByText("The server's key")).toBeVisible();

  // A good key: saved, masked, never shown in full
  await field.fill("nvapi-good-key-wxyz");
  await ai.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Key saved. The AI uses it from its next batch.")).toBeVisible();
  await expect(ai.getByText("Your own key")).toBeVisible();
  await expect(ai.getByText("••••wxyz")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("nvapi-good-key-wxyz");
  await expect(field).toHaveValue("");

  // Change the model; Test AI now runs; switch back
  await ai.getByRole("combobox", { name: "Model" }).click();
  await page.getByRole("option", { name: "nvidia/e2e-other" }).click();
  await expect(page.getByText("Model changed to nvidia/e2e-other")).toBeVisible();
  await expect(ai.getByRole("status")).toHaveText(/^Working: answered in/);
  await ai.getByRole("button", { name: "Switch back to nvidia/e2e-model" }).click();
  await expect(ai.getByRole("combobox", { name: "Model" })).toHaveText("nvidia/e2e-model");
  expect(await auditLayout(page, info.project.name === "phone" ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-settings-ai-key.png`, fullPage: true });

  // Back to the server's key
  await ai.getByRole("button", { name: "Use the server's key" }).click();
  await expect(ai.getByText("The server's key")).toBeVisible();
});
