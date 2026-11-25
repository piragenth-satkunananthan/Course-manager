// The M1b gaps a completeness review found (#19–#22): navigation between the views, the week and month edges,
// statuses on the week grid, the month's overflow, the day sheet's layout and closing, Deadlines details, and the
// switches' loading feedback. Phone and desktop unless a test says otherwise.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { auditLayout, seedCourse, signIn } from "./helpers";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
const nowTime = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const monday = (date: string) => addDays(date, 1 - weekday(date));
const fmt = (date: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`)).replace(",", "");
const signedIn = async (page: Page) => {
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
};
const api = (page: Page) => {
  const H = { origin: new URL(page.url()).origin };
  return {
    post: async (path: string, data: object) => (await page.request.post(`/api/v1/${path}`, { headers: H, data })).json(),
    put: (path: string, data: object) => page.request.put(`/api/v1/${path}`, { headers: H, data }),
    del: (path: string) => page.request.delete(`/api/v1/${path}`, { headers: H }),
  };
};

test.describe("desktop: the week grid", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "the week grid is desktop only"));

  test("statuses are spoken on blocks and chips; the week moves by link and the switch goes to the month and back", async ({ page }) => {
    await signedIn(page);
    const { courseId } = await seedCourse(page, "GS1");
    const a = api(page);
    const day = today();
    const lecture = await a.post(`courses/${courseId}/class-sessions`, { kind: "lecture", weekday: weekday(day), startTime: "09:00", endTime: "11:00" });
    await a.post("session-changes", { kind: "cancel", classSessionId: lecture.id, date: day });
    await a.post("session-changes", { kind: "extra", courseId, sessionKind: "lab", date: day, start: "18:00", end: "19:00" });
    if (nowTime() > "00:01") await a.post("assignments", { courseId, title: "GS1 past due", dueDate: day, dueTime: "00:01" });
    const done = await a.post("assignments", { courseId, title: "GS1 handed in", dueDate: day, dueTime: "23:00" });
    await a.put(`assignments/${done.id}/status`, { status: "submitted" });

    await page.goto(`/timetable?view=week&week=${monday(day)}`);
    const grid = page.getByRole("region", { name: /^Week of / });
    await expect(grid.getByRole("button", { name: /^GS1 Lecture, .+, cancelled$/ })).toBeVisible();
    await expect(grid.getByRole("button", { name: /^GS1 Lab, .+, 18:00 to 19:00, extra session$/ })).toBeVisible();
    if (nowTime() > "00:01") await expect(grid.getByRole("button", { name: "GS1 Assignment: GS1 past due, 00:01, overdue" })).toBeVisible();
    await expect(grid.getByRole("button", { name: "GS1 Assignment: GS1 handed in, 23:00, submitted" })).toBeVisible();

    // The week by link: Previous week; a mid-week date means its week; a bad week falls back to this one
    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL(new RegExp(`week=${addDays(monday(day), -7)}$`));
    await page.goto(`/timetable?view=week&week=${addDays(monday(day), 2)}`);
    await expect(page.getByRole("region", { name: `Week of ${fmt(monday(day))}` })).toBeVisible();
    await page.goto("/timetable?view=week&week=garbage");
    await expect(page.getByRole("region", { name: `Week of ${fmt(monday(day))}` })).toBeVisible();

    // Week → Month → Week through the switch
    await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Month" }).click();
    await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${day.slice(0, 7)}$`));
    await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Week" }).click();
    await expect(page).toHaveURL(new RegExp(`/timetable\\?view=week&week=${monday(day)}$`));
  });

  test("at 1024 px, the narrowest width that shows it, the grid fits: no sideways scroll, targets large enough", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await signedIn(page);
    const { courseId } = await seedCourse(page, "GS2");
    const a = api(page);
    await a.post(`courses/${courseId}/class-sessions`, { kind: "lecture", weekday: weekday(today()), startTime: "10:00", endTime: "12:00" });
    await a.post("assignments", { courseId, title: `GS2 ${"a very long Assignment title ".repeat(4)}`, dueDate: today() });
    await page.goto("/timetable?view=week");
    await expect(page.getByRole("region", { name: /^Week of / })).toBeVisible();
    expect(await auditLayout(page, 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });
    expect(await page.getByTestId("week-scroll").evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await page.screenshot({ path: "test-results/screenshots/desktop-1024-week.png", fullPage: true });
  });
});

test("the month: overflow dots and chips, the pager across a year, the arrow keys, and closing the sheet", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "GMP" : "GMD";
  await signedIn(page);
  const { courseId, shift } = await seedCourse(page, code);
  const a = api(page);
  const day = shift(2);
  for (const [s, e] of [["07:00", "08:00"], ["08:00", "09:00"], ["09:00", "10:00"], ["10:00", "11:00"], ["11:00", "12:00"]])
    await a.post(`courses/${courseId}/class-sessions`, { kind: "lecture", weekday: weekday(day), startTime: s, endTime: e });
  for (const t of ["07:00", "07:05", "07:10"]) await a.post("assignments", { courseId, title: `${code} pile ${t}`, dueDate: day, dueTime: t });

  // Overflow: 4 dots then "+n", 2 chips then "+n"; the label still names every Deadline
  await page.goto(`/calendar?month=${day.slice(0, 7)}`);
  const cell = page.getByRole("grid").getByRole("button", { name: new RegExp(`^${fmt(day)}(, today)?: .*${code} ${code} pile 07:10`) });
  await expect(cell.getByTestId("dot")).toHaveCount(4);
  await expect(cell.getByText(/^\+\d+$/)).toHaveCount(2);
  for (const t of ["07:00", "07:05", "07:10"]) await expect(cell).toHaveAttribute("aria-label", new RegExp(`${code} pile ${t}`));

  // The sheet: a bottom sheet on phones, a side panel on desktop, its targets large enough; Back and ✕ close it
  await cell.click();
  const sheet = page.getByRole("dialog", { name: new RegExp(fmt(day)) });
  await expect(sheet).toBeVisible();
  const box = (await sheet.boundingBox())!;
  const vp = page.viewportSize()!;
  if (phone) expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(vp.height - 1);
  else expect(Math.round(box.x + box.width)).toBeGreaterThanOrEqual(vp.width - 1);
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${day.slice(0, 7)}$`));
  await cell.click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${day.slice(0, 7)}$`));

  // Arrow keys: a week up and down, Home and End to the row's ends; the first row doesn't go up; Tab returns to the cell
  await cell.focus();
  const focused = () => page.locator(":focus").getAttribute("aria-label");
  await page.keyboard.press("ArrowDown");
  if (!(await focused())?.startsWith(fmt(day))) {
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^${fmt(addDays(day, 7))}`));
    await page.keyboard.press("ArrowUp");
  }
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^${fmt(day)}`));
  await page.keyboard.press("Home");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^${fmt(monday(day))}`));
  await page.keyboard.press("End");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^${fmt(addDays(monday(day), 6))}`));
  const firstCell = page.getByRole("grid").getByRole("button").first();
  await firstCell.focus();
  await page.keyboard.press("ArrowUp");
  await expect(firstCell).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(firstCell).toBeFocused();

  // The pager across a year, and back to this month
  await page.goto("/calendar?month=2026-12");
  await page.getByRole("link", { name: "Next month" }).click();
  await expect(page).toHaveURL(/month=2027-01$/);
  await expect(page.getByRole("grid", { name: "January 2027" })).toBeVisible();
  await page.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/month=2026-12$/);
  await page.getByRole("link", { name: "This month" }).click();
  await expect(page).toHaveURL(new RegExp(`month=${today().slice(0, 7)}$`));
  await expect(page.getByRole("link", { name: "This month" })).toHaveAttribute("aria-current", "date");
});

test("Deadlines: unticking restores In progress, a tick on a deleted item cleans up, and a full list fits at 320 px", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "GDP" : "GDD";
  await signedIn(page);
  const { courseId, shift } = await seedCourse(page, code);
  const a = api(page);
  const busy = await a.post("assignments", { courseId, title: `${code} was in progress`, dueDate: shift(3) });
  await a.put(`assignments/${busy.id}/status`, { status: "in_progress" });
  await a.put(`assignments/${busy.id}/status`, { status: "submitted" });
  const gone = await a.post("assignments", { courseId, title: `${code} deleted elsewhere`, dueDate: shift(4) });
  for (let i = 0; i < 4; i++) await a.post("assignments", { courseId, title: `${code} ${"long title ".repeat(6)}${i}`, dueDate: shift(i * 5 - 3) });

  // Untick in Submitted: back to In progress, from its history
  await page.goto(`/assignments?status=submitted&course=${courseId}`);
  await page.getByRole("checkbox", { name: `Mark ${code} was in progress submitted` }).click();
  await expect(page.getByText(`${code} was in progress is no longer submitted`)).toBeVisible();
  await page.goto(`/assignments?course=${courseId}`);
  await page.getByRole("button", { name: new RegExp(`${code} was in progress`) }).click();
  await expect(page.getByRole("dialog").getByRole("radio", { name: "In progress" })).toBeChecked();
  await page.keyboard.press("Escape");

  // Deleted elsewhere, then ticked here: an error, and the list drops it
  await a.del(`assignments/${gone.id}?expectedVersion=${gone.version}`);
  await page.getByRole("checkbox", { name: `Mark ${code} deleted elsewhere submitted` }).click();
  await expect(page.getByText("Assignment not found")).toBeVisible();
  await expect(page.getByText(`${code} deleted elsewhere`, { exact: true })).toHaveCount(0);

  // 320 px with long titles and several groups
  await page.setViewportSize({ width: 320, height: 640 });
  await page.reload();
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
});

test("another Student with their own Courses never sees the first Student's from a copied Course link", async ({ page, browser }, info) => {
  const code = info.project.name === "phone" ? "GOP" : "GOD";
  await signedIn(page);
  const { courseId } = await seedCourse(page, code);
  await api(page).post("assignments", { courseId, title: `${code} first Student's`, dueDate: today() });

  const email = `other-${info.project.name}@example.com`;
  execFileSync("npx", ["tsx", "e2e/support/seed-empty-student.ts", email, "another long password"], { env: { ...process.env, ...E2E_ENV }, stdio: "inherit" });
  const other = await browser.newPage({ viewport: page.viewportSize()! });
  await signIn(other, "another long password", email);
  await expect(other.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const own = await seedCourse(other, `${code}2`);
  await api(other).post("assignments", { courseId: own.courseId, title: `${code} second Student's`, dueDate: today() });
  await other.goto(`/assignments?course=${courseId}`);
  await expect(other.getByText(`${code} second Student's`)).toBeVisible(); // the unknown Course is ignored: all their own
  await expect(other.getByText(`${code} first Student's`)).toHaveCount(0);
  await other.close();
});

test("switching a filter on the same page shows that it's loading; the Undo batch dialog fits a phone", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "GLP" : "GLD";
  await signedIn(page);
  const { courseId, shift } = await seedCourse(page, code);
  execFileSync("npx", ["tsx", "e2e/support/seed-auto-change.ts", "student@example.com", courseId, `${code} ${"a long announcement ".repeat(8)}`, shift(5), "batch"], { env: { ...process.env, ...E2E_ENV }, stdio: "inherit" });

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  await page.route("**/*", async (r) => {
    const h = r.request().headers();
    if (h["rsc"] && !h["next-router-prefetch"]) await new Promise((done) => setTimeout(done, 1500));
    await r.continue();
  });
  await page.getByRole("radiogroup", { name: "Show" }).getByRole("radio", { name: "Needs attention" }).click();
  await expect.poll(() => page.getByRole("status", { name: "Loading" }).count(), { intervals: [0, 25, 50, 100], timeout: 1500 }).toBeGreaterThan(0);
  await expect(page).toHaveURL(/filter=attention$/);
  await page.unroute("**/*");

  await page.goto("/activity?filter=changes");
  const item = page.getByRole("listitem").filter({ hasText: `${code} a long announcement` }).first();
  await expect(item.getByRole("button", { name: "Show more" })).toBeVisible();
  await item.getByRole("button", { name: /^Undo batch \(2\)$/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, small: [] });
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
  await expect(item.getByRole("button", { name: /^Undo batch \(2\)$/ })).toBeVisible(); // nothing undone
});
