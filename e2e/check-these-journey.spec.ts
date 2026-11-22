// The #14 journey at phone and desktop sizes: sign-in and permissions, the empty Activity Log, navigation and loading,
// form validation, error handling, and screenshots of each state (written to test-results/screenshots).
import { expect, type Page, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, seedAutoChange, seedCourse, signIn } from "./helpers";

const shot = (page: Page, project: string, name: string) => page.screenshot({ path: `test-results/screenshots/${project}-${name}.png`, fullPage: true });
const ZERO = "00000000-0000-4000-8000-000000000000";

test.describe("signed out", () => {
  test("the Activity Log sends you to sign-in, and Dismiss and resolve answer 401", async ({ page }) => {
    await page.goto("/activity");
    await expect(page).toHaveURL(/\/login$/);
    const H = { origin: new URL(page.url()).origin };
    expect((await page.request.post(`/api/v1/possibly-missed/${ZERO}/dismiss`, { headers: H })).status()).toBe(401);
    expect((await page.request.post(`/api/v1/unknown-courses/${ZERO}/resolve`, { headers: H, data: { action: "ignore" } })).status()).toBe(401);
  });
});

test("an empty Activity Log, reached from the navigation behind a loading skeleton", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // Slow the navigation request (not the prefetch) so the skeleton can be seen.
  await page.route("**/*", async (r) => {
    const h = r.request().headers();
    if (h["rsc"] && !h["next-router-prefetch"]) await new Promise((done) => setTimeout(done, 1500));
    await r.continue();
  });
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  if (phone) {
    await nav.getByRole("button", { name: "More" }).click(); // Activity sits under More on phones
    await page.getByRole("link", { name: "Activity" }).click();
  } else {
    await nav.getByRole("link", { name: "Activity" }).click();
  }
  await expect.poll(() => page.getByRole("status", { name: "Loading" }).count(), { intervals: [0, 25, 50, 100], timeout: 1500 }).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await page.unroute("**/*");
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByText("Changes the AI makes from your WhatsApp groups will show here, each with Undo.")).toBeVisible();
  const layout = await auditLayout(page, phone ? 44 : 40);
  expect(layout).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });
  await shot(page, info.project.name, "activity-empty");
});

test("validation, errors and another Student's items", async ({ page, browser }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "JNP" : "JND";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  seedAutoChange(courseId, `${code} lab sheet`, shift(3), undefined, "missed");
  seedAutoChange(courseId, `${code}U`, shift(4), undefined, "unknown");

  await page.goto("/activity");
  const missed = page.getByRole("listitem").filter({ hasText: "This might be a deadline" }).filter({ hasText: `${code} lab sheet` });
  const unknown = page.getByRole("listitem").filter({ hasText: `Message mentions ${code}U,` });
  await expect(missed).toBeVisible();
  await expect(unknown).toBeVisible();
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });
  await shot(page, info.project.name, "activity-items");
  const summary = page.getByRole("alert").filter({ hasText: /\S/ });

  // Validation: Add Assignment from the message, without a title or date
  await missed.getByRole("button", { name: "Add Assignment" }).click();
  const assignment = page.getByRole("dialog", { name: "New Assignment" });
  await assignment.getByRole("button", { name: "Save Assignment" }).click();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Title: Enter a title");
  await expect(assignment.getByLabel("Course (required)")).toContainText(code); // the pre-fill survives
  // A form taller than the screen stays inside it and scrolls, with its title reachable.
  const box = (await assignment.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(assignment.getByRole("heading", { name: "New Assignment" })).toBeInViewport();
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await shot(page, info.project.name, "add-assignment-errors");
  await page.keyboard.press("Escape");

  // Validation: Nickname of… with no Course chosen
  await unknown.getByRole("button", { name: "Nickname of…" }).click();
  const which = page.getByRole("dialog", { name: `Which Course is "${code}U"?` });
  await which.getByRole("button", { name: "Save" }).click();
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Course: Choose a Course");
  await shot(page, info.project.name, "nickname-errors");
  await page.keyboard.press("Escape");

  // Validation: Add course with an empty code, then a code this Semester already has (the server's answer)
  await unknown.getByRole("button", { name: "Add course" }).click();
  const add = page.getByRole("dialog", { name: `Add "${code}U" as a Course` });
  await add.getByLabel("Code (required)").fill("");
  await add.getByRole("button", { name: "Add Course" }).click();
  await expect(summary).toContainText("Code: Enter the Course code");
  await expect(summary).toContainText("Colour: Choose a colour");
  await add.getByLabel("Code (required)").fill(code);
  await add.getByRole("radio", { name: "Pink" }).click();
  await add.getByRole("button", { name: "Add Course" }).click();
  await expect(add.getByLabel("Code (required)")).toHaveAccessibleDescription(/already/i);
  await shot(page, info.project.name, "add-course-errors");
  await page.keyboard.press("Escape");

  // Error handling: Dismiss that can't reach the server says so, and the message stays
  await page.route("**/api/v1/possibly-missed/**", (r) => r.abort());
  await missed.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Couldn't reach the server. Check your connection and try again.")).toBeVisible();
  await expect(missed).toBeVisible();
  await page.unroute("**/api/v1/possibly-missed/**");

  // Error handling: resolved meanwhile (another tab): Ignore says so and the page shows the new state
  const entries = (await (await page.request.get("/api/v1/activity")).json()).items;
  const entry = entries.find((i: { type: string; name?: string }) => i.type === "unknown_course" && i.name === `${code}U`);
  const H = { origin: new URL(page.url()).origin };
  await page.request.post(`/api/v1/unknown-courses/${entry.id}/resolve`, { headers: H, data: { action: "nickname", courseId } });
  await unknown.getByRole("button", { name: "Ignore" }).click();
  await expect(page.getByText("This Unknown Course was already resolved")).toBeVisible();
  await page.reload();
  await expect(unknown).toContainText("Linked to a Course");
  await expect(unknown.getByRole("button", { name: "Ignore" })).toHaveCount(0);
  await shot(page, info.project.name, "activity-resolved");

  // Permissions: another Student sees none of it, and can't dismiss or resolve it
  const message = entries.find((i: { type: string; text?: string }) => i.type === "possibly_missed" && i.text?.startsWith(`${code} lab sheet`));
  const other = await browser.newPage();
  await signIn(other, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(other.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  await other.goto("/activity");
  await expect(other.getByText(`${code} lab sheet`)).toHaveCount(0);
  const OH = { origin: new URL(other.url()).origin };
  expect((await other.request.post(`/api/v1/possibly-missed/${message.inboxMessageId}/dismiss`, { headers: OH })).status()).toBe(404);
  expect((await other.request.post(`/api/v1/unknown-courses/${entry.id}/resolve`, { headers: OH, data: { action: "ignore" } })).status()).toBe(404);
  await other.close();

  // Dismiss works once the server is reachable
  await missed.getByRole("button", { name: "Dismiss" }).click();
  await expect(missed).toHaveCount(0);
});
