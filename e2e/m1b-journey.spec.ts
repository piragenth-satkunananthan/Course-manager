// The M1b screens' journey checks (#19, #20, #21) at phone and desktop sizes: sign-in and permissions, empty and
// loading states, error handling and form validation. Layout, navigation and the main flows are in week-grid,
// month-view and deadline-lists specs; this file covers what those leave out.
import { expect, type Page, test } from "@playwright/test";
import { EMPTY_STUDENT } from "./global-setup";
import { auditLayout, seedCourse, signIn } from "./helpers";

const ZERO = "00000000-0000-4000-8000-000000000000";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const shot = (page: Page, project: string, name: string) => page.screenshot({ path: `test-results/screenshots/${project}-m1b-${name}.png`, fullPage: true });
const signedIn = async (page: Page, password?: string, email?: string) => {
  await signIn(page, password, email);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
};
/** Slows the navigation request (not the prefetch), so the loading skeleton can be seen. */
const slowNavigation = (page: Page) =>
  page.route("**/*", async (r) => {
    const h = r.request().headers();
    if (h["rsc"] && !h["next-router-prefetch"]) await new Promise((done) => setTimeout(done, 1500));
    await r.continue();
  });
const skeletonShows = (page: Page) => expect.poll(() => page.getByRole("status", { name: "Loading" }).count(), { intervals: [0, 25, 50, 100], timeout: 1500 }).toBeGreaterThan(0);

test.describe("signed out", () => {
  test("the week grid, the month, the day sheet and the Deadlines lists send you to sign-in; their APIs answer 401", async ({ page }) => {
    for (const path of [`/timetable?view=week&week=${today()}`, "/calendar", `/calendar?day=${today()}`, "/assignments?status=submitted", "/exams"]) {
      await page.goto(path);
      await expect(page, path).toHaveURL(/\/login$/);
    }
    const H = { origin: new URL(page.url()).origin };
    expect((await page.request.get(`/api/v1/calendar?month=${today().slice(0, 7)}`)).status()).toBe(401);
    expect((await page.request.post(`/api/v1/ai-batches/${ZERO}/undo`, { headers: H })).status()).toBe(401);
    expect((await page.request.put(`/api/v1/assignments/${ZERO}/status`, { headers: H, data: { status: "unsubmitted" } })).status()).toBe(401);
  });
});

test("an empty account: each M1b screen has its empty state and a loading skeleton", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  await signedIn(page, EMPTY_STUDENT.password, EMPTY_STUDENT.email);

  // Deadlines with no Courses: one action, to add a Course
  await page.goto("/assignments");
  await expect(page.getByText("No Courses yet. Assignments and Exams belong to a Course, so add one first.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add a Course" })).toBeVisible();
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });
  await shot(page, info.project.name, "deadlines-empty");

  // The month: every cell says it's empty
  await page.goto("/calendar");
  const cells = page.getByRole("grid").getByRole("button");
  await expect(cells).toHaveCount(42);
  expect(await cells.evaluateAll((els) => els.every((e) => /: no classes$/.test(e.getAttribute("aria-label") ?? "")))).toBe(true);
  await shot(page, info.project.name, "month-empty");

  // A day with nothing: the sheet says so
  await page.goto(`/calendar?day=${today()}`);
  await expect(page.getByRole("dialog").getByText(/^No classes on /)).toBeVisible();
  await page.keyboard.press("Escape");

  // The week (desktop): the grid draws, with no classes
  if (!phone) {
    await page.goto("/timetable?view=week");
    await expect(page.getByRole("region", { name: /^Week of / })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Week of / }).getByRole("button")).toHaveCount(0);
    await shot(page, info.project.name, "week-empty");
  }

  // Loading: the skeleton shows while the month and the Deadlines load
  await page.goto("/timetable?view=day");
  await page.waitForLoadState("networkidle");
  await slowNavigation(page);
  await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Month" }).click();
  await skeletonShows(page);
  await expect(page.getByRole("grid")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
  await nav.getByRole("link", { name: "Deadlines" }).click();
  await skeletonShows(page);
  await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
  await page.unroute("**/*");
});

test("another Student's Courses, classes and Deadlines never show, even from a copied link", async ({ page, browser }, info) => {
  const code = info.project.name === "phone" ? "MJP" : "MJD";
  await signedIn(page);
  const { courseId, shift } = await seedCourse(page, code);
  const H = { origin: new URL(page.url()).origin };
  const day = shift(1);
  await page.request.post(`/api/v1/courses/${courseId}/class-sessions`, { headers: H, data: { kind: "lecture", weekday: weekday(day), startTime: "09:00", endTime: "11:00" } });
  const mine = await (await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: `${code} private work`, dueDate: day } })).json();

  const other = await browser.newPage({ viewport: page.viewportSize()! });
  await signedIn(other, EMPTY_STUDENT.password, EMPTY_STUDENT.email);
  await other.goto(`/assignments?course=${courseId}`); // the first Student's Course id: ignored
  await expect(other.getByText(`${code} private work`)).toHaveCount(0);
  await expect(other.getByText("No Courses yet.", { exact: false })).toBeVisible();
  await other.goto(`/calendar?day=${day}`);
  await expect(other.getByRole("dialog").getByText(/^No classes on /)).toBeVisible();
  await expect(other.getByText(`${code} private work`)).toHaveCount(0);
  const OH = { origin: new URL(other.url()).origin };
  expect((await other.request.put(`/api/v1/assignments/${mine.id}/status`, { headers: OH, data: { status: "submitted" } })).status()).toBe(404);
  const batches = (await (await page.request.get("/api/v1/activity")).json()).items.filter((i: { batchId?: string }) => i.batchId);
  if (batches.length) expect((await other.request.post(`/api/v1/ai-batches/${batches[0].batchId}/undo`, { headers: OH })).status()).toBe(404);
  await other.close();
});

test("errors and validation: a Submitted tick that can't be saved, a bad month in the link, and the forms these screens open", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "MEP" : "MED";
  await signedIn(page);
  const { courseId, shift } = await seedCourse(page, code);
  const H = { origin: new URL(page.url()).origin };
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: `${code} offline tick`, dueDate: shift(2) } });

  // A tick that can't reach the server: it says so, and the Assignment stays To do
  await page.goto(`/assignments?course=${courseId}`);
  await page.route("**/api/v1/assignments/*/status", (r) => r.abort());
  const tick = page.getByRole("checkbox", { name: `Mark ${code} offline tick submitted` });
  await tick.click();
  await expect(page.getByText("Couldn't reach the server. Check your connection and try again.")).toBeVisible();
  await expect(tick).not.toBeChecked();
  await page.unroute("**/api/v1/assignments/*/status");
  await shot(page, info.project.name, "tick-error");

  // Add from the Deadlines page: an empty form is caught, with a focused summary
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("menuitem", { name: "Assignment" }).click();
  const form = page.getByRole("dialog", { name: "New Assignment" });
  await form.getByRole("button", { name: "Save Assignment" }).click();
  const summary = page.getByRole("alert").filter({ hasText: /\S/ });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText("Title: Enter a title");
  await page.keyboard.press("Escape");

  // A bad month or day in the link falls back instead of failing
  await page.goto("/calendar?month=2026-13&day=not-a-date");
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await page.request.get("/api/v1/calendar?month=2026-13")).status()).toBe(400);

  // The week grid's class sheet: a reschedule ending before it starts is caught (desktop: the grid is desktop only)
  if (!phone) {
    const day = shift(1);
    await page.request.post(`/api/v1/courses/${courseId}/class-sessions`, { headers: H, data: { kind: "lab", weekday: weekday(day), startTime: "14:00", endTime: "16:00" } });
    const monday = new Date(Date.parse(`${day}T00:00:00Z`) - (weekday(day) - 1) * 86_400_000).toISOString().slice(0, 10);
    await page.goto(`/timetable?view=week&week=${monday}`);
    await page.getByRole("region", { name: /^Week of / }).getByRole("button", { name: new RegExp(`^${code} Lab, `) }).first().click();
    await page.getByRole("button", { name: "Reschedule" }).click();
    const reschedule = page.getByRole("dialog", { name: `Reschedule ${code} Lab` });
    await reschedule.getByLabel("Start (required)").fill("16:00");
    await reschedule.getByLabel("End (required)").fill("15:00");
    await reschedule.getByRole("button", { name: "Save" }).click();
    await expect(reschedule.getByLabel("End (required)")).toHaveAccessibleDescription("The end time must be after the start time");
    // and a failed save says so, keeping the form
    await page.route("**/api/v1/session-changes**", (r) => r.abort());
    await reschedule.getByLabel("End (required)").fill("17:00");
    await reschedule.getByRole("button", { name: "Save" }).click();
    await expect(summary).toContainText("Couldn't reach the server. Check your connection and try again.");
    await expect(reschedule.getByLabel("Start (required)")).toHaveValue("16:00");
    await page.unroute("**/api/v1/session-changes**");
    await shot(page, info.project.name, "reschedule-errors");
  }
});
