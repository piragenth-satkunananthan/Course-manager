import type { Page } from "@playwright/test";
import { STUDENT } from "./global-setup";

export async function signIn(page: Page, password = STUDENT.password) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(STUDENT.email);
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
