import { execFileSync } from "node:child_process";
import type { Page } from "@playwright/test";
import { E2E_ENV } from "../playwright.config";
import { STUDENT } from "./global-setup";

export async function signIn(page: Page, password = STUDENT.password, email = STUDENT.email) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password (required)").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** A Semester and a Course created through the API as the signed-in Student. Returns the Course id. */
export async function seedCourse(page: Page, code: string) {
  const H = { origin: new URL(page.url()).origin };
  const today = new Date().toISOString().slice(0, 10);
  const shift = (d: number) => new Date(Date.parse(today) + d * 86_400_000).toISOString().slice(0, 10);
  const sem = await (await page.request.post("/api/v1/semesters", { headers: H, data: { name: `Sem ${code}`, startDate: shift(-60), endDate: shift(60) } })).json();
  const course = await (await page.request.post("/api/v1/courses", { headers: H, data: { semesterId: sem.id, code, name: "Data Structures", colour: "cyan" } })).json();
  return { courseId: course.id as string, shift };
}

/**
 * Design-system checks for the current page: nothing scrolls sideways, one h1, and every tap target is at
 * least `min` px (44 on phones, 40 from md). Inline links in a sentence and hidden form mirrors are exempt.
 */
export async function auditLayout(page: Page, min: number) {
  // Measure the settled layout: a dialog mid zoom-in reads 5% small.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  return page.evaluate((min) => {
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && !el.closest("[aria-hidden=true]") && getComputedStyle(el).visibility !== "hidden";
    };
    const small = [...document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=checkbox], [role=radio], summary")]
      .filter((el) => visible(el) && !el.closest("p"))
      .map((el) => {
        const box = (el.closest("label") ?? el).getBoundingClientRect();
        const name = (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.tagName).trim().slice(0, 40);
        return { name, w: Math.round(box.width), h: Math.round(box.height) };
      })
      .filter((x) => x.h < min || x.w < min);
    return { sidewaysScroll: document.documentElement.scrollWidth - window.innerWidth, h1Count: document.querySelectorAll("h1").length, small };
  }, min);
}

/** A real Auto Change: a WhatsApp message processed by the real AI batch, with a fake AI creating `title`. */
export function seedAutoChange(courseId: string, title: string, dueDate: string, email = "student@example.com", mode: "create" | "missed" | "unknown" = "create") {
  execFileSync("npx", ["tsx", "e2e/support/seed-auto-change.ts", email, courseId, title, dueDate, mode], { env: { ...process.env, ...E2E_ENV }, stdio: "inherit" });
}
