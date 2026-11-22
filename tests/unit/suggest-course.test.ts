// Seam: the Course suggested for a WhatsApp group from its name (#26).
import { describe, expect, it } from "vitest";
import { suggestCourse } from "@/lib/suggest-course";

const courses = [{ id: "t", code: "SWT22022" }, { id: "o", code: "CS2010" }];

describe("suggestCourse", () => {
  it("finds the Course whose code is in the group name, ignoring case", () => {
    expect(suggestCourse("SWT22022/(22/23)", courses)?.id).toBe("t");
    expect(suggestCourse("swt22022 IAD batch", courses)?.id).toBe("t");
  });
  it("needs the whole code, not part of a longer one", () => {
    expect(suggestCourse("SWT220221 group", courses)).toBeUndefined();
    expect(suggestCourse("XSWT22022", courses)).toBeUndefined();
  });
  it("suggests nothing when no code or several codes match", () => {
    expect(suggestCourse("Batch 22/23", courses)).toBeUndefined();
    expect(suggestCourse("SWT22022 and CS2010", courses)).toBeUndefined();
  });
});
