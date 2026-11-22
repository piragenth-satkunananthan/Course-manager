// Seam: the plain keyword check that flags ignored messages and questions as Possibly Missed (design §9, file 27).
import { describe, expect, it } from "vitest";
import { looksLikeDeadline } from "@/server/domain/possibly-missed";

describe("looksLikeDeadline", () => {
  it.each([
    "Lab report due tomorrow",
    "Please SUBMIT the form",
    "deadline extended",
    "quiz on Monday",
    "Exam hall changed",
    "viva schedule out",
    "Lecture cancelled",
    "class postponed",
    "meet at 4.30",
    "meet at 3pm",
    "meet at 10 am",
    "starts 16:30",
    "on 27th",
    "on 3/12",
    "on 2026-12-03",
    "on 12 Dec",
    "by December 3",
  ])("flags %j", (text) => expect(looksLikeDeadline(text)).toBe(true));

  it.each(["Who didn't attend today's lecture?", "thanks all", "ok noted", "see the slides", "version 2.0 of the notes", "Group 4 photos", "1st year students", "2nd semester notes"])(
    "leaves %j alone",
    (text) => expect(looksLikeDeadline(text)).toBe(false),
  );
});
