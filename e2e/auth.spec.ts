// Seam: the real app in a browser, at phone and desktop sizes (#5).
import { expect, test, type Page } from "@playwright/test";
import { STUDENT } from "./global-setup";

async function signIn(page: Page, password = STUDENT.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STUDENT.email);
  await page.getByLabel("Password (required)").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("signed out, the dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Course-manager" })).toBeVisible();
});

test("a wrong password shows an error", async ({ page }) => {
  await signIn(page, "not the right password");
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("Email or password is incorrect");
});

test("an empty form shows an error under each field and a focused summary", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeFocused();
  await expect(page.getByLabel("Email (required)")).toHaveAccessibleDescription("Enter your email");
  await expect(page.getByLabel("Password (required)")).toHaveAccessibleDescription("Enter your password");
});

test("the Student signs in and sees the empty dashboard with the right navigation", async ({ page }, info) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => /Content Security Policy/i.test(m.text()) && cspErrors.push(m.text()));

  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Add your Courses and the Deadlines you already know about.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add Course" })).toBeVisible();

  const navs = page.getByRole("navigation", { name: "Main" });
  const visible = navs.filter({ visible: true });
  await expect(visible).toHaveCount(1);
  await expect(visible.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  if (info.project.name === "phone") {
    await expect(visible.getByRole("button", { name: "More" })).toBeVisible();
    const box = await visible.boundingBox();
    expect(box!.y + box!.height).toBeCloseTo(812, -1); // pinned to the bottom
  } else {
    await expect(visible.getByRole("link", { name: "Settings" })).toBeVisible();
  }
  expect(cspErrors).toEqual([]);
});

test("pages carry the security headers, with a fresh CSP nonce per request", async ({ request }) => {
  const a = await request.get("/login");
  const b = await request.get("/login");
  const csp = a.headers()["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(b.headers()["content-security-policy"]).not.toBe(csp);
  expect(a.headers()["x-frame-options"]).toBe("DENY");
  expect(a.headers()["referrer-policy"]).toBe("same-origin");
  expect(a.headers()["strict-transport-security"]).toContain("max-age=");
});
