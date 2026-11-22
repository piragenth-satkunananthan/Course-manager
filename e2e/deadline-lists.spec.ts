// Seam: the Deadlines lists (#21) at phone and desktop sizes: the Assignments | Exams switch, status and Course
// filters in the URL, the groups, Mark Submitted in one tap, an empty state, and the loading skeleton.
import { expect, test } from "@playwright/test";
import { auditLayout, seedCourse, signIn } from "./helpers";

test("filter, group and submit Assignments; switch to Exams; empty and loading states", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "DLP" : "DLD";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  const other = (await seedCourse(page, `${code}2`)).courseId;
  const H = { origin: new URL(page.url()).origin };
  const add = (path: string, data: object) => page.request.post(`/api/v1/${path}`, { headers: H, data: { courseId, ...data } });
  await add("assignments", { title: `${code} late`, dueDate: shift(-2) });
  await add("assignments", { title: `${code} soon`, dueDate: shift(0) }); // today: This week (untimed, due 23:59)
  await add("assignments", { title: `${code} far`, dueDate: shift(14) });
  await add("exams", { title: `${code} quiz`, date: shift(14), startTime: "09:00" });
  await add("exams", { title: `${code} final` }); // TBA

  // From the navigation; the Course filter goes into the URL
  await page.goto(`/assignments?course=${courseId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Deadlines" })).toBeVisible();
  const group = (name: string) => page.getByRole("region", { name: new RegExp(`^${name} \\(\\d+\\)$`) });
  await expect(group("Overdue")).toContainText(`${code} late`);
  await expect(group("This week")).toContainText(`${code} soon`);
  await expect(group("Later")).toContainText(`${code} far`);
  expect(await auditLayout(page, phone ? 44 : 40)).toMatchObject({ sidewaysScroll: 0, h1Count: 1, small: [] });
  await page.screenshot({ path: `test-results/screenshots/${info.project.name}-deadlines.png`, fullPage: true });

  // Mark Submitted in one tap: it leaves To do and shows under Submitted
  await page.getByRole("checkbox", { name: `Mark ${code} far submitted` }).click();
  await expect(page.getByText(`Marked ${code} far submitted`)).toBeVisible();
  await expect(page.getByText(`${code} far`, { exact: true })).toHaveCount(0);
  await page.getByRole("radiogroup", { name: "Status" }).getByRole("radio", { name: "Submitted" }).click();
  await expect(page).toHaveURL(new RegExp(`/assignments\\?status=submitted&course=${courseId}$`));
  await expect(group("Later")).toContainText(`${code} far`);

  // Another Course with nothing in it: the empty state
  await page.getByLabel("Course").click();
  await page.getByRole("option", { name: `${code}2 Data Structures` }).click();
  await expect(page).toHaveURL(new RegExp(`/assignments\\?status=submitted&course=${other}$`));
  await expect(page.getByText(`No submitted Assignments for ${code}2.`)).toBeVisible();

  // Exams, back on the first Course: dated ones by week, TBA ones in their own group
  await page.goto(`/assignments?course=${courseId}`);
  await page.getByRole("radiogroup", { name: "Deadlines" }).getByRole("radio", { name: "Exams" }).click();
  await expect(page).toHaveURL(new RegExp(`/exams\\?course=${courseId}$`));
  await expect(group("Later")).toContainText(`${code} quiz`);
  await expect(group("Date TBA")).toContainText(`${code} final`);
  await expect(page.getByRole("radiogroup", { name: "Status" })).toHaveCount(0); // Exams have no status

  // Loading: the skeleton shows while the list is on its way
  await page.route("**/*", async (r) => {
    const h = r.request().headers();
    if (h["rsc"] && !h["next-router-prefetch"]) await new Promise((done) => setTimeout(done, 1500));
    await r.continue();
  });
  await page.getByRole("radiogroup", { name: "Deadlines" }).getByRole("radio", { name: "Assignments" }).click();
  await expect.poll(() => page.getByRole("status", { name: "Loading" }).count(), { intervals: [0, 25, 50, 100], timeout: 1500 }).toBeGreaterThan(0);
  await expect(page).toHaveURL(new RegExp(`/assignments\\?course=${courseId}$`));
});
