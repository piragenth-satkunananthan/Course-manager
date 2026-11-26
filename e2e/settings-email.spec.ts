// Settings → Email and alerts (#82, U46) at phone and desktop sizes; the confirmation email comes from the fake server.
import { expect, test } from "@playwright/test";
import { EMAIL_PORT } from "../playwright.config";
import { auditLayout, signIn } from "./helpers";

test("send emails to another address once its link is opened, go back, and turn an alert kind off", async ({ page, request }, info) => {
  const address = `inbox-${info.project.name}@example.com`;
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.goto("/settings#email");
  const section = page.getByRole("region", { name: "Email and alerts" });
  await expect(section).toContainText("go to student@example.com (your login email).");

  // A bad address is caught; a good one waits for its link
  const field = section.getByLabel("Send emails to another address");
  await field.fill("not an email");
  await section.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(section.getByRole("alert").filter({ hasText: "Enter an email address like name@example.com" })).toBeVisible();
  await field.fill(address);
  await section.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(section.getByRole("status").filter({ hasText: `Waiting for you to open the link sent to ${address}` })).toBeVisible();

  // Open the link from the email
  const emails = (await (await request.get(`http://127.0.0.1:${EMAIL_PORT}/emails`)).json()) as { to: string[]; text: string }[];
  const mail = emails.filter((e) => e.to.includes(address)).at(-1)!;
  await page.goto(mail.text.match(/https?:\/\/\S+email-confirm\S*/)![0]);
  await expect(page.getByText("Email confirmed. Reminders and alerts now go there.")).toBeVisible();
  await expect(section).toContainText(`go to ${address}.`);
  expect(await auditLayout(page, info.project.name === "phone" ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-settings-email.png`, fullPage: true });

  // An alert kind off stays off
  await section.getByRole("checkbox", { name: "Too many changes in one batch" }).click();
  await expect(page.getByText("Alerts saved")).toBeVisible();
  await page.reload();
  await expect(section.getByRole("checkbox", { name: "Too many changes in one batch" })).not.toBeChecked();
  await section.getByRole("checkbox", { name: "Too many changes in one batch" }).click();

  // Back to the login email
  await section.getByRole("button", { name: "Use my login email" }).click();
  await expect(section).toContainText("go to student@example.com (your login email).");
});
