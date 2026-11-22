// Seam: the month view and its day sheet (#20), at phone and desktop sizes.
import { expect, test } from "@playwright/test";
import { auditLayout, seedCourse, signIn } from "./helpers";

const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const fmt = (date: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`)).replace(",", "");

test("a class dot and a Deadline chip on their day; the day sheet opens from a tap or the keyboard, with the day in the URL", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "MVP" : "MVD";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  const day = shift(3);
  const H = { origin: new URL(page.url()).origin };
  const session = await (await page.request.post(`/api/v1/courses/${courseId}/class-sessions`, { headers: H, data: { kind: "lecture", weekday: weekday(day), startTime: "09:00", endTime: "11:00" } })).json();
  await page.request.post("/api/v1/session-changes", { headers: H, data: { kind: "cancel", classSessionId: session.id, date: shift(10) } });
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: `${code} month report`, dueDate: day, dueTime: phone ? "07:00" : "07:05" } }); // early: a cell shows its first 2 chips
  await page.request.post("/api/v1/assignments", { headers: H, data: { courseId, title: `${code} late sheet`, dueDate: shift(-2) } });

  // From the timetable's switch to the month of that day
  await page.goto(`/timetable?view=day&date=${day}`);
  await page.getByRole("radiogroup", { name: "View" }).getByRole("radio", { name: "Month" }).click();
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${day.slice(0, 7)}$`));
  const grid = page.getByRole("grid");

  // A dot and a chip on the day, in the cell's label too
  // (the other project's run adds its own class and Deadline to the same Student and day)
  const cell = grid.getByRole("button", { name: new RegExp(`^${fmt(day)}(, today)?: [^;]+; \\d+ Deadlines?: .*${code} ${code} month report`) });
  await expect(cell).toBeVisible();
  expect(await cell.getByTestId("dot").count()).toBeGreaterThanOrEqual(1);
  await expect(cell.getByText(code, { exact: true })).toBeVisible();
  const box = (await cell.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(56);
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1 });
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-month.png`, fullPage: true });

  // A cancelled class is a hollow dot; an overdue Assignment is said so (red ring and icon on screen)
  if (shift(10).slice(0, 7) === day.slice(0, 7)) {
    expect(await grid.getByRole("button", { name: new RegExp(`^${fmt(shift(10))}: \\d+ class(es)?, \\d+ cancelled`) }).getByTestId("dot-cancelled").count()).toBeGreaterThanOrEqual(1);
  }
  if (shift(-2).slice(0, 7) === day.slice(0, 7)) {
    await expect(grid.getByRole("button", { name: new RegExp(`${code} late sheet, overdue$`) })).toBeVisible();
  }

  // Tap: the day sheet, with the day in the URL; Escape closes it and drops the day
  await cell.click();
  await expect(page).toHaveURL(new RegExp(`day=${day}$`));
  const sheet = page.getByRole("dialog", { name: new RegExp(fmt(day)) });
  await expect(sheet.getByText(`${code} Lecture`)).toBeVisible();
  await expect(sheet.getByText(`${code} month report`)).toBeVisible();
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-day-sheet.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/calendar\\?month=${day.slice(0, 7)}$`));

  // Keyboard: one tab stop, arrows move by a day and a week, Enter opens
  await cell.focus();
  await page.keyboard.press("ArrowRight");
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (next.slice(0, 7) === day.slice(0, 7) || weekday(day) < 7) {
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^${fmt(next)}`));
    await page.keyboard.press("ArrowLeft");
  }
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", new RegExp(`^${fmt(day)}`));
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`day=${day}$`));
  await expect(page.getByRole("dialog")).toBeVisible();
});
