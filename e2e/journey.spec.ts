// The whole journey so far (#5–#7) at phone and desktop sizes: authentication and permissions, layout, navigation,
// empty states, loading, form validation and error handling.
import { expect, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, seedCourse, signIn } from "./helpers";

test.describe("signed out", () => {
  test("every page sends you to sign-in, and the API answers 401", async ({ page }) => {
    for (const path of ["/", "/courses", "/settings", "/timetable", "/courses/00000000-0000-4000-8000-000000000000"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
    expect((await page.request.get("/api/v1/courses")).status()).toBe(401);
    expect((await page.request.get("/api/v1/dashboard")).status()).toBe(401);
  });
});

test("an empty account: empty states, layout, navigation and sign out", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();

  // Signed in, /login goes home.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);

  // No worker runs in these tests, so the health banner shows (design-system §6.10: an icon and one sentence).
  await expect(page.getByRole("status").filter({ hasText: "Reminders may be delayed. We've been alerted." })).toBeVisible();

  // Empty states: each says what will appear and offers the action that fills it.
  await expect(page.getByText("Add your Courses and the Deadlines you already know about.")).toBeVisible();
  await page.goto("/courses");
  await expect(page.getByText("Courses belong to a Semester. Add the Semester you're in first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add Semester" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByText(/No Semesters yet/)).toBeVisible();

  // Layout at this size and at 320 px.
  for (const width of [null, 320]) {
    if (width) await page.setViewportSize({ width, height: 700 });
    for (const path of ["/", "/courses", "/settings", "/timetable", "/assignments", "/activity"]) {
      await page.goto(path);
      const a = await auditLayout(page, phone || width ? 44 : 40);
      expect(a, `${path} at ${width ?? "default"} px`).toEqual({ sidewaysScroll: 0, h1Count: 1, small: [] });
    }
  }
  await page.setViewportSize(phone ? { width: 375, height: 812 } : { width: 1280, height: 800 });

  // Navigation: one nav for the size, the current page marked, Back works, nothing leads to "Page not found".
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  await nav.getByRole("link", { name: "Courses" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Courses" })).toHaveAttribute("aria-current", "page");
  for (const [link, heading] of [["Timetable", "Timetable"], ["Deadlines", "Deadlines"]]) {
    await nav.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Timetable" })).toBeVisible();
  if (phone) {
    await nav.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Activity" }).click();
  } else {
    await nav.getByRole("link", { name: "Activity" }).click();
  }
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();

  // Sign out from Settings; protected pages are closed again.
  await page.goto("/settings");
  await expect(page.getByText(EMPTY_STUDENT.email)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/courses");
  await expect(page).toHaveURL(/\/login$/);
});

test("another Student's Course is 'Page not found'", async ({ page, browser }, info) => {
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId } = await seedCourse(page, info.project.name === "phone" ? "PRV1" : "PRV2");

  const other = await browser.newPage({ baseURL: info.project.use.baseURL });
  await signIn(other, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await expect(other.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  // The page streams behind a loading skeleton, so Next.js has already sent HTTP 200; what matters is what's shown.
  await other.goto(`/courses/${courseId}`);
  await expect(other.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(other.getByText(/PRV\d/)).toHaveCount(0);
  await other.close();
});

test("a full account: layout with data, validation, a failed save, and loading", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, phone ? "JP1" : "JD1");
  const H = { origin: new URL(page.url()).origin };
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: "Journey overdue", dueDate: shift(-1) } });
  await page.request.post("/api/v1/exams", { headers: H, data: { courseId, title: "Journey TBA" } });

  for (const width of [null, 320]) {
    if (width) await page.setViewportSize({ width, height: 700 });
    for (const path of ["/", "/courses", `/courses/${courseId}`, "/settings", `/timetable?date=${shift(2)}`]) {
      await page.goto(path);
      const a = await auditLayout(page, phone || width ? 44 : 40);
      expect(a, `${path} at ${width ?? "default"} px`).toEqual({ sidewaysScroll: 0, h1Count: 1, small: [] });
    }
  }
  await page.setViewportSize(phone ? { width: 375, height: 812 } : { width: 1280, height: 800 });

  // Validation: an Exam time without a date is refused inline, with a focused summary; dialogs pass the layout check too.
  await page.goto("/");
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("menuitem", { name: "Exam" }).click();
  const examForm = page.getByRole("dialog", { name: "New Exam" });
  await examForm.getByLabel("Start time").fill("10:00");
  await examForm.getByRole("button", { name: "Save Exam" }).click();
  const summary = page.getByRole("alert").filter({ hasText: /\S/ });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Title: Enter a title");
  await expect(examForm.getByLabel("Start time")).toHaveAccessibleDescription("Add the date too, or leave the time empty while it's TBA");
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await page.keyboard.press("Escape");

  // Error handling: a save that can't reach the server says so, and keeps the form open with the values.
  await page.goto("/settings");
  await page.route("**/api/v1/semesters", (r) => (r.request().method() === "POST" ? r.abort() : r.continue()));
  await page.getByRole("button", { name: "Add Semester" }).click();
  const semForm = page.getByRole("dialog", { name: "Add Semester" });
  await semForm.getByLabel("Name (required)").fill("Offline semester");
  await semForm.getByLabel("Start date (required)").fill(shift(70));
  await semForm.getByLabel("End date (required)").fill(shift(150));
  await semForm.getByRole("button", { name: "Add Semester" }).click();
  await expect(summary).toContainText("Couldn't reach the server. Check your connection and try again.");
  await expect(semForm.getByLabel("Name (required)")).toHaveValue("Offline semester");
  await page.unroute("**/api/v1/semesters");
  await page.keyboard.press("Escape");

  // Loading: while a page's data is on its way, a skeleton shows, never a blank screen. The navigation request
  // (not the prefetch) is slowed, and the skeleton is checked the moment the click lands.
  await page.route("**/*", async (r) => {
    const h = r.request().headers();
    if (h["rsc"] && !h["next-router-prefetch"]) await new Promise((done) => setTimeout(done, 2000));
    await r.continue();
  });
  await page.goto("/settings");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await nav.getByRole("link", { name: "Courses" }).click();
  await expect.poll(() => page.getByRole("status", { name: "Loading" }).count(), { intervals: [0, 25, 50, 100], timeout: 2000 }).toBeGreaterThan(0);
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
});
