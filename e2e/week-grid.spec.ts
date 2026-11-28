// Seam: the desktop week grid (#19) at 1280 px, and its absence under 1024 px.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { auditLayout, seedCourse, signIn } from "./helpers";

/** A Student of its own: other specs add classes to the shared one, which crowd its week and narrow the blocks. */
function ownStudent() {
  const email = `week-grid-${Date.now()}@example.com`; // unique: a retry or rerun creates a fresh one
  execFileSync("npx", ["tsx", "e2e/support/seed-empty-student.ts", email, "week grid password"], { env: { ...process.env, ...E2E_ENV }, stdio: "inherit" });
  return email;
}

const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // ISO 1–7
const monday = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - (weekday(date) - 1) * 86_400_000).toISOString().slice(0, 10);
const colombo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()); // "2026-11-22, 20:15"

test("the week grid: classes, Deadlines, the week in the URL, keyboard and labels", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the week grid is desktop only; the phone case is below");
  await signIn(page, "week grid password", ownStudent());
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId } = await seedCourse(page, "WG1");
  const [today, nowTime] = colombo().split(", ") as [string, string];
  const H = { origin: new URL(page.url()).origin };
  await page.request.post(`/api/v1/courses/${courseId}/class-sessions`, { headers: H, data: { kind: "lecture", weekday: weekday(today), startTime: "09:00", endTime: "11:00", location: "Hall A" } });
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: "WG1 grid report", dueDate: today, dueTime: "23:00" } });

  // On a desktop, the timetable opens on the week; Day and back to Week through the switch, kept in the URL.
  await page.goto("/timetable");
  const views = page.getByRole("radiogroup", { name: "View" });
  await expect(views.getByRole("radio", { name: "Week" })).toBeChecked();
  await views.getByRole("radio", { name: "Day" }).click();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?view=day&date=${today}$`));
  await expect(page.getByRole("region", { name: /^Week of / })).toBeHidden();
  await views.getByRole("radio", { name: "Week" }).click();
  await expect(page).toHaveURL(new RegExp(`/timetable\\?view=week&week=${monday(today)}$`));
  await expect(views.getByRole("radio", { name: "Week" })).toBeChecked();
  await expect(page.getByText("20:00", { exact: true })).toBeVisible(); // both edges of the hours are labelled

  const grid = page.getByRole("region", { name: /^Week of / });
  const block = grid.getByRole("button", { name: new RegExp(`^WG1 Lecture, .+, 09:00 to 11:00, Hall A$`) });
  await expect(block).toBeVisible();
  const box = (await block.boundingBox())!;
  expect(Math.round(box.height)).toBe(96); // 2 hours at 48 px
  const chip = grid.getByRole("button", { name: "WG1 Assignment: WG1 grid report, 23:00" });
  await expect(chip).toBeVisible();
  // The current-time line: only between 07:00 and 20:00 Colombo time, on today's column.
  const inGrid = nowTime >= "07:00" && nowTime <= "20:00";
  await expect(page.getByTestId("now-line")).toHaveCount(inGrid ? 1 : 0);

  // Vertical scrolling only: the hours scroll inside the grid, and nothing scrolls sideways.
  const scroll = page.getByTestId("week-scroll");
  expect(await scroll.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  expect(await scroll.evaluate((e) => getComputedStyle(e).overflowX)).toBe("hidden");
  expect(await auditLayout(page, 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });
  await page.screenshot({ path: "test-results/screenshots/desktop-week-grid.png", fullPage: true });

  // Keyboard: a class is reachable and opens its sheet; Escape closes it.
  await block.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "WG1 Lecture" });
  await expect(sheet.getByRole("button", { name: "Cancel this class" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "WG1 grid report" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The week is in the URL: next week, then back to this week.
  await page.getByRole("link", { name: "Next week" }).click();
  const next = new Date(Date.parse(`${monday(today)}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  await expect(page).toHaveURL(new RegExp(`week=${next}$`));
  await expect(grid.getByRole("button", { name: /^WG1 Lecture/ })).toHaveCount(1); // the class repeats weekly
  await expect(grid.getByRole("button", { name: /grid report/ })).toHaveCount(0);
  await page.getByRole("link", { name: "This week" }).click();
  await expect(page).toHaveURL(new RegExp(`week=${monday(today)}$`));
});

test("under 1024 px there's no Week option, and the timetable (or a week link) shows the day list", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "phone width only");
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const [today] = colombo().split(", ") as [string];
  await page.goto("/timetable");
  await expect(page.getByRole("region", { name: /^Classes on / })).toBeVisible();
  await page.goto(`/timetable?view=week&week=${monday(today)}`);
  const views = page.getByRole("radiogroup", { name: "View" });
  await expect(views.getByRole("radio", { name: "Week" })).toBeHidden();
  await expect(views.getByRole("radio", { name: "Day" })).toBeChecked();
  await expect(page.getByRole("region", { name: /^Week of / })).toBeHidden();
  await expect(page.getByRole("region", { name: /^Classes on / })).toBeVisible();
  expect(await auditLayout(page, 44)).toMatchObject({ sidewaysScroll: 0, small: [] });
});
