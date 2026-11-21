// Seam: weekly classes and the day list in a browser, at phone and desktop sizes (#8).
import { expect, test } from "@playwright/test";
import { seedCourse, signIn } from "./helpers";

const weekday = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // ISO 1–7

test("add a weekly class, cancel one week of it, reschedule it instead, and move between days", async ({ page }, info) => {
  const code = info.project.name === "phone" ? "TP1" : "TD1";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  const day = shift(2);

  // Weekly class on the Course page, with validation
  await page.goto(`/courses/${courseId}`);
  await page.getByRole("button", { name: "Add class" }).click();
  const form = page.getByRole("dialog", { name: "Add weekly class" });
  await form.getByLabel("Kind (required)").click();
  await page.getByRole("option", { name: "Lecture" }).click();
  await form.getByLabel("Day (required)").click();
  await page.getByRole("option", { name: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][weekday(day) - 1] }).click();
  await form.getByLabel("Start (required)").fill("10:00");
  await form.getByLabel("End (required)").fill("09:00");
  await form.getByRole("button", { name: "Save class" }).click();
  await expect(form.getByLabel("End (required)")).toHaveAccessibleDescription("The end time must be after the start time");
  await form.getByLabel("End (required)").fill("12:00");
  await form.getByLabel("Location").fill("Hall B2");
  await form.getByRole("button", { name: "Save class" }).click();
  await expect(page.getByRole("list", { name: `${code} weekly classes` })).toContainText("10:00–12:00 Lecture");

  // The day list: date in the URL, previous/next/Today
  await page.goto(`/timetable?date=${day}`);
  const row = page.getByRole("region", { name: /^Classes on/ }).getByRole("listitem").filter({ hasText: `${code} Lecture` });
  await expect(row).toContainText("Hall B2");
  await page.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(new RegExp(`date=${shift(3)}`));
  await page.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(new RegExp(`date=${day}`));

  // Cancel this week's class
  await row.getByRole("button").first().click();
  await page.getByRole("button", { name: "Cancel this class" }).click();
  await expect(row).toContainText("Cancelled");

  // Reschedule it instead (PATCHes the existing change)
  await row.getByRole("button").first().click();
  await page.getByRole("button", { name: "Reschedule instead" }).click();
  const r = page.getByRole("dialog", { name: `Reschedule ${code} Lecture` });
  await r.getByLabel("Start (required)").fill("14:00");
  await r.getByLabel("End (required)").fill("16:00");
  await r.getByRole("button", { name: "Save" }).click();
  await expect(row).toContainText("Moved from 10:00");
  await expect(row).toContainText("14:00");

  await page.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(new RegExp(`date=${shift(0)}`));
});

test("if a change arrived meanwhile, the sheet edits that change instead of failing", async ({ page }, info) => {
  const code = info.project.name === "phone" ? "TP2" : "TD2";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  const day = shift(3);
  const H = { origin: new URL(page.url()).origin };
  const session = await (await page.request.post(`/api/v1/courses/${courseId}/class-sessions`, { headers: H, data: { kind: "lab", weekday: weekday(day), startTime: "14:00", endTime: "16:00" } })).json();

  await page.goto(`/timetable?date=${day}`);
  const row = page.getByRole("region", { name: /^Classes on/ }).getByRole("listitem").filter({ hasText: `${code} Lab` });
  await row.getByRole("button").first().click();
  // Meanwhile (in the app, the AI) the class is rescheduled.
  await page.request.post("/api/v1/session-changes", { headers: H, data: { kind: "reschedule", classSessionId: session.id, date: day, newDate: day, newStart: "15:00", newEnd: "17:00" } });
  await page.getByRole("button", { name: "Cancel this class" }).click();
  await expect(page.getByText(`${code} Lab cancelled`)).toBeVisible();
  await expect(row).toContainText("Cancelled");
});
