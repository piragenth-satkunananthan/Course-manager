// The Possibly Missed keyword check (design §9, file 27): no AI, just dates, times and deadline words.
const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*";
const PATTERNS = [
  /\b(?:due|submit\w*|deadlines?|quiz\w*|exams?|viva\w*|cancel\w*|postpone\w*)\b/i, // deadline words
  /\b(?:[01]?\d|2[0-3])[.:][0-5]\d\b/, // 4.30, 16:30
  /\b(?:1[0-2]|0?[1-9])\s?(?:am|pm)\b/i, // 3pm, 10 am
  /\b\d{1,2}(?:st|nd|rd|th)\b(?!\s+(?:year|yr|sem|semester|batch|floor|place|attempt))/i, // 27th, not "1st year"
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/, // 3/12, 2026-12-03
  new RegExp(`\\b\\d{1,2}\\s+${MONTH}\\b|\\b${MONTH}\\s+\\d{1,2}\\b`, "i"), // 12 Dec, December 3
];

export const looksLikeDeadline = (text: string) => PATTERNS.some((p) => p.test(text));
