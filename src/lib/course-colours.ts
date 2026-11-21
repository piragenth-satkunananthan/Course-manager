// The one place Course colour names map to styles (design-system §2.1, §9). Tokens live in globals.css.
import type { COURSE_COLOURS } from "@/shared/schemas/course";

type Colour = (typeof COURSE_COLOURS)[number];

export const COLOUR_LABEL: Record<Colour, string> = {
  blue: "Blue", violet: "Violet", pink: "Pink", orange: "Orange", cyan: "Cyan", olive: "Olive", slate: "Slate",
};
// Full class names, so Tailwind sees them.
export const COLOUR_BG: Record<Colour, string> = {
  blue: "bg-course-blue", violet: "bg-course-violet", pink: "bg-course-pink", orange: "bg-course-orange", cyan: "bg-course-cyan", olive: "bg-course-olive", slate: "bg-course-slate",
};
