// Seam: forgot password through a fake email server, change password, and account deletion, at phone and desktop
// sizes (#17). Each runs on its own throwaway account, so the other tests' Student is untouched.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { E2E_ENV, EMAIL_PORT } from "../playwright.config";
import { auditLayout, signIn } from "./helpers";

const PASSWORD = "an old long password";
const account = (email: string) =>
  execFileSync("npx", ["tsx", "e2e/support/seed-empty-student.ts", email, PASSWORD], { env: { ...process.env, ...E2E_ENV }, stdio: "inherit" });
const emailsTo = async (page: Page, to: string) =>
  ((await (await page.request.get(`http://127.0.0.1:${EMAIL_PORT}/emails`)).json()) as { to: string[]; subject: string; text: string }[]).filter((e) => e.to.includes(to));
const dashboard = (page: Page) => expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

test("forgot password: the emailed link sets a new password, and the old one stops working", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const email = `reset-${info.project.name}@example.com`;
  account(email);

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reset password" })).toBeVisible();
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Email: Enter your email");
  await page.getByLabel("Email (required)").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
  await expect(page.getByRole("status")).toContainText("If the email exists, a link has been sent.");

  await expect.poll(async () => (await emailsTo(page, email)).length).toBe(1);
  const [mail] = await emailsTo(page, email);
  expect(mail!.subject).toBe("Reset your Course-manager password");
  await page.goto(/https?:\/\/\S+/.exec(mail!.text)![0]);
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel("New password (required)").fill("short");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByLabel("New password (required)")).toHaveAccessibleDescription("Use at least 12 characters");
  await page.getByLabel("New password (required)").fill("a brand new long password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByRole("status")).toContainText("Your password was changed");
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-reset-done.png`, fullPage: true });

  await signIn(page, PASSWORD, email);
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Email or password is incorrect");
  await signIn(page, "a brand new long password", email);
  await dashboard(page);
});

test("change password in Settings, then delete the account", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const email = `delete-${info.project.name}@example.com`;
  account(email);
  await signIn(page, PASSWORD, email);
  await dashboard(page);
  await page.goto("/settings");

  // Change password: the wrong current password is caught on its field
  await page.getByRole("button", { name: "Change password" }).click();
  const change = page.getByRole("dialog", { name: "Change password" });
  await change.getByLabel("Current password (required)").fill("not my password");
  await change.getByLabel("New password (required)").fill("a changed long password");
  await change.getByRole("button", { name: "Change password" }).click();
  await expect(change.getByLabel("Current password (required)")).toHaveAccessibleDescription("That password isn't right");
  await change.getByLabel("Current password (required)").fill(PASSWORD);
  await change.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Other devices were signed out.")).toBeVisible();

  // Delete: needs the password
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await expect(dialog).toContainText("Backups age out within 7 days.");
  await dialog.getByLabel("Your password (required)").fill(PASSWORD); // the old one no longer works
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(dialog.getByLabel("Your password (required)")).toHaveAccessibleDescription("That password isn't right");
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-delete-dialog.png`, fullPage: true });
  await dialog.getByLabel("Your password (required)").fill("a changed long password");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(async () => (await emailsTo(page, email)).map((e) => e.subject)).toContain("Your Course-manager account was deleted");

  // Gone: the account can't sign in, and pages send you to sign-in
  await signIn(page, "a changed long password", email);
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("Email or password is incorrect");
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
