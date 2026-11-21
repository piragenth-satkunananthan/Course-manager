import type { Page } from "@playwright/test";
import { STUDENT } from "./global-setup";

export async function signIn(page: Page, password = STUDENT.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STUDENT.email);
  await page.getByLabel("Password (required)").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
