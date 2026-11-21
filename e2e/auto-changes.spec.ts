// Seam: the Activity Log and Undo in a browser at phone and desktop sizes (#12).
import { expect, test } from "@playwright/test";
import { auditLayout, seedAutoChange, seedCourse, signIn } from "./helpers";

test("an Auto Change shows its source; Undo removes it; Undo is blocked after an edit, with the reason", async ({ page }, info) => {
  const phone = info.project.name === "phone";
  const code = phone ? "ACP" : "ACD";
  await signIn(page);
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
  const { courseId, shift } = await seedCourse(page, code);
  seedAutoChange(courseId, `${code} Lab A`, shift(4));
  seedAutoChange(courseId, `${code} Lab B`, shift(5));

  await page.goto("/activity");
  const itemA = page.getByRole("listitem").filter({ hasText: `${code} Lab A: due` });
  await expect(itemA.getByRole("blockquote")).toContainText(`${code} Lab A due ${shift(4)}`);
  await expect(itemA).toContainText("From Course group · Kasun");
  expect((await auditLayout(page, phone ? 44 : 40)).small).toEqual([]);

  // Undo
  await itemA.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText(`Undone: ${code} Lab A: due`)).toBeVisible();
  await expect(itemA.getByText("Undone", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Due soon (next 14 days)" }).getByText(`${code} Lab A`)).toHaveCount(0);

  // Blocked Undo after the Student edits the item
  const H = { origin: new URL(page.url()).origin };
  const items = await (await page.request.get("/api/v1/assignments")).json();
  const b = items.find((x: { title: string }) => x.title === `${code} Lab B`);
  await page.request.patch(`/api/v1/assignments/${b.id}`, { headers: H, data: { expectedVersion: b.version, title: `${code} Lab B (mine)` } });
  await page.goto("/activity");
  const itemB = page.getByRole("listitem").filter({ hasText: `${code} Lab B: due` });
  await expect(itemB.getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(itemB.getByRole("button", { name: "Undo" })).toHaveAccessibleDescription("You edited this after the change");
});
