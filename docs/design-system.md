# Course-manager Design System

*   **Status:** Proposed (2026-11-21)
*   **Applies to:** the web app in `docs/designs/course-manager.md`: Next.js, Tailwind CSS 4 and shadcn/ui
*   **Vocabulary:** capitalised terms (Course, Class Session, Occurrence, Assignment, Exam, Deadline, Auto Change, Possibly Missed and so on) mean what `GLOSSARY.md` says. The interface uses the same words.

This document defines how Course-manager looks and behaves: its tokens, components, navigation, interaction patterns and main screens. It is a specification. No application code is written until the spec and tickets are approved (`CLAUDE.md`).

---

## 1. Principles

1. **Deadlines first.** The app exists to stop Missed Deadlines (G1). On every screen, the nearest Deadline and anything Overdue is the most prominent thing.
2. **Phone first.** Every screen is designed at 375 px wide first, then widened. Nothing needs a mouse, hover or a wide screen to work.
3. **One accent.** Teal is the only accent colour. It marks the primary action and the current location, and nothing else. Course colours identify Courses; they never mark actions.
4. **Never colour alone.** Status always has a text label or an icon as well as a colour (Overdue, cancelled, Submitted, an AI change).
5. **Show what the AI did.** Every Auto Change shows where it came from and how to undo it. Changes that move a Deadline later or cancel something stand out.
6. **Quiet and fast.** A minimal Swiss style: plenty of white space, a clear type hierarchy, flat surfaces, short transitions.

---

## 2. Foundations

### 2.1 Colour

Style: **Minimalism / Swiss**, from the UI UX Pro Max recommendation; see §10 for what was changed from it. All contrast ratios below were calculated with the WCAG 2.x formula.

**Semantic tokens (light mode, used in M1).** Components use these tokens only, never raw hex values or Tailwind palette classes such as `bg-teal-700` (shadcn theming rule).

| Token | Value | Used for | Contrast |
|---|---|---|---|
| `--background` | `#F8FAFC` | Page background | n/a |
| `--foreground` | `#0F172A` | Body text, headings | 17.1:1 on background |
| `--card` | `#FFFFFF` | Cards, sheets, dialogs | n/a |
| `--card-foreground` | `#0F172A` | Text on cards | 17.9:1 |
| `--muted` | `#F1F5F9` | Subtle fills (table headers, skeletons, disabled fields) | n/a |
| `--muted-foreground` | `#475569` | Secondary text, metadata, helper text | 7.6:1 on card, 6.9:1 on muted |
| `--primary` | `#0F766E` | **The accent:** primary buttons, links, the current nav item, focus ring, selected states | 5.5:1 with white text |
| `--primary-hover` | `#115E59` | Primary button hover and pressed state | 7.6:1 with white text |
| `--primary-foreground` | `#FFFFFF` | Text and icons on primary | n/a |
| `--primary-subtle` | `#F0FDFA` | The current nav item's background, selected rows | primary text on it: 5.3:1 |
| `--border` | `#E2E8F0` | Decorative dividers and card outlines (never the only cue) | n/a |
| `--input` | `#8291A6` | Borders of form fields, checkboxes and segmented controls | 3.2:1 on card (meets WCAG 1.4.11) |
| `--ring` | `#0F766E` | Focus ring: 2 px, with a 2 px offset | 5.5:1 on card |
| `--destructive` | `#B91C1C` | Overdue, errors, destructive buttons | 6.5:1 on card; white on it 6.5:1 |
| `--destructive-subtle` | `#FEF2F2` | Background of an error banner | destructive text on it: 5.9:1 |
| `--warning` | `#B45309` | Due within 24 hours, a Deadline moved later, "Check these" | 5.0:1 on card |
| `--warning-subtle` | `#FFFBEB` | Background of a warning banner | warning text on it: 4.8:1 |
| `--success` | `#15803D` | Submitted, saved, connected | 5.0:1 on card |
| `--success-subtle` | `#F0FDF4` | Background of a success banner | n/a |

The status colours (destructive, warning and success) are **not accents**. They appear only with their icon and label (§3).

**Course colours.** The Student picks one per Course. They are used only as a 4 px left bar, a dot, or a chip border. Text in a Course chip is always `--foreground`, with the Course code next to the colour. Every colour reaches at least 4.5:1 on white, so it stays visible as a thin mark. Teal is left out on purpose, so a Course never looks like the accent.

| Name | Hex | On white |
|---|---|---|
| Blue | `#1D4ED8` | 6.7:1 |
| Violet | `#6D28D9` | 7.1:1 |
| Pink | `#BE185D` | 6.0:1 |
| Orange | `#C2410C` | 5.2:1 |
| Cyan | `#0E7490` | 5.4:1 |
| Olive | `#4D7C0F` | 5.0:1 |
| Slate | `#475569` | 7.6:1 |

**Dark mode (M2, reserved).** These tokens are defined now so components never assume a light background. They are switched on in M2.

| Token | Dark value | Contrast |
|---|---|---|
| `--background` | `#0B1120` | n/a |
| `--card` | `#111827` | n/a |
| `--foreground` | `#E2E8F0` | 15.3:1 on background |
| `--muted-foreground` | `#94A3B8` | 6.9:1 on card |
| `--primary` | `#2DD4BF` | 9.5:1 on card |
| `--primary-foreground` | `#042F2E` | 7.8:1 on primary |
| `--input` | `#64748B` | 3.7:1 on card |
| `--destructive` / `--warning` / `--success` | `#F87171` / `#FBBF24` / `#4ADE80` | 6.4 / 10.6 / 10.2 on card |

### 2.2 Typography

**Typeface:** **Plus Jakarta Sans** (variable), loaded through `next/font/google` with `display: swap`, using weights 400, 500, 600 and 700. Monospace text (Course codes in tables, if ever needed) uses the system mono stack. One family keeps the type consistent.

| Token | Size / line height | Weight | Used for |
|---|---|---|---|
| `text-display` | 30 / 36 px (24 / 32 on screens under 768 px) | 700 | Page title on desktop ("Dashboard") |
| `text-title` | 20 / 28 px | 600 | Section headings ("Due soon", "Today") |
| `text-heading` | 18 / 26 px | 600 | Card titles, sheet titles |
| `text-body` | **16 / 24 px** | 400 | Default text, form inputs (16 px stops iOS from zooming in) |
| `text-body-strong` | 16 / 24 px | 600 | Deadline titles, list primary lines |
| `text-small` | 14 / 20 px | 400 or 500 | Metadata (time, location, Course code), helper text, buttons |
| `text-caption` | 12 / 16 px | 500 | Badges and the month-grid date numbers **only**; never paragraphs |

**Rules:**
- Body text is never smaller than 16 px.
- Line length is 45–75 characters (`max-w-prose` on reading text).
- Numbers in times and dates use tabular figures (`font-variant-numeric: tabular-nums`), so lists line up.
- Times are shown in 24-hour form with a colon ("16:30"), which avoids the "4.30" ambiguity. Dates read "Fri 20 Nov".
- "Time not announced" is written out, never just "23:59".

### 2.3 Spacing, sizing and radius

**The spacing scale has a 4 px base.** Only these values are used (in Tailwind units):

| Token | px | Typical use |
|---|---|---|
| `space-1` | 4 | Icon-to-text gap inside badges |
| `space-2` | 8 | **The minimum gap between two tappable things**; gaps inside rows |
| `space-3` | 12 | Padding inside list rows and chips |
| `space-4` | 16 | **The page gutter on phones**; card padding |
| `space-6` | 24 | The gap between sections; card padding on desktop |
| `space-8` | 32 | The page gutter on desktop; the gap between major regions |
| `space-12` | 48 | The top of empty states |
| `space-16` | 64 | Rarely: the spacing above the login card |

**Sizes:**
- **Touch targets:** at least **44 × 44 px** for anything tappable, including icon buttons, list rows and month-grid days. The visible icon can be smaller (20 px), as long as the hit area is 44 px. This is stricter than WCAG 2.2's 24 px minimum, because the app is used on phones.
- **Controls:** buttons and inputs are 44 px tall on phones and 40 px on desktop (`md:` and up).
- **Corner radius:**
  - `--radius-sm` 6 px: badges, inputs;
  - `--radius-md` 10 px: buttons, list rows, cards;
  - `--radius-lg` 14 px: sheets and dialogs;
  - `full`: chips and dots.
- **Elevation:** flat by default. Cards use a 1 px `--border` and no shadow. Only floating layers (sheets, dialogs, dropdowns and toasts) get `shadow-md`.

### 2.4 Layout and breakpoints

These are Tailwind's default breakpoints, and the design is mobile first: base styles are for phones.

| Range | Layout |
|---|---|
| **under 768 px** (phone) | One column, 16 px gutters. Top app bar (56 px) and bottom navigation (64 px plus the safe-area inset). Content gets bottom padding equal to the nav height, so the nav never covers it. |
| **768–1023 px** (tablet) | A collapsed sidebar of icons with labels, 72 px wide, and no bottom nav. One or two columns. |
| **1024 px and up** (desktop) | A full sidebar, 240 px wide. Content is capped at 1200 px and centred, with 32 px gutters. The dashboard has two columns (8 / 4 of 12). |

**Layout rules:**
- Nothing scrolls sideways at 320 px wide.
- The week grid is the only wide component. It is shown only from 1024 px up; below that, the day list is shown instead.
- Zoom is never disabled.
- Layouts reserve space for loading content (skeletons the same size as the content), so nothing jumps when data arrives.

### 2.5 Iconography

- **Library:** Lucide, which shadcn uses by default. Icons are 20 px with a 1.75 stroke; 16 px inside badges. Never emoji.
- **Decorative icons**, next to a text label, get `aria-hidden="true"`.
- **Icon-only buttons** (Undo in a compact row, the "more" menu, the previous and next arrows) have an `aria-label`, plus a tooltip on desktop.
- **Fixed meanings:**

  | Meaning | Icon |
  |---|---|
  | Overdue | `AlertCircle` |
  | Due soon | `Clock` |
  | Submitted | `CheckCircle2` |
  | Cancelled | `Ban` |
  | Rescheduled | `ArrowRightLeft` |
  | Extra session | `PlusCircle` |
  | Auto Change | `Sparkles` |
  | Possibly Missed | `HelpCircle` |
  | WhatsApp disconnected | `WifiOff` |
  | Exam | `GraduationCap` |
  | Assignment | `FileText` |
  | Lecture / Tutorial / Lab | `Presentation` / `Users` / `FlaskConical` |
  | Undo | `Undo2` |

### 2.6 Motion

Motion is subtle: it tells you something happened, and is never decorative.

- **Durations and easing:**
  - **Small feedback** (hover, press, toggle): 150 ms.
  - **Panels** (sheets, dialogs, toasts): 200 ms entering and 150 ms leaving, so leaving is faster.
  - **Easing:** `ease-out` when entering, `ease-in` when leaving.
- **What may animate:** only `opacity` and `transform`; never width, height or top.
- **Reduced motion:** under `prefers-reduced-motion: reduce`, transitions are instant, and sheets appear without sliding.
- **No animation library.** UI UX Pro Max suggested a GSAP scroll reveal, but it was left out: this is an app, not a marketing page, and CSS transitions are enough.

---

## 3. Accessibility rules (the target is WCAG 2.2 AA)

| Rule | How it applies here |
|---|---|
| Contrast | Text is at least 4.5:1, and large text, controls and focus rings at least 3:1. The palette in §2.1 meets this. |
| Never colour alone | Every status has an icon and a word ("Overdue", "Cancelled", "Moved later"). Course colour always comes with the Course code. |
| Keyboard | Everything can be reached with Tab, in visual order. Sheets and dialogs trap focus, close with Esc, and return focus to the button that opened them. The month grid is a grid: arrow keys move between days, and Enter opens a day. |
| Visible focus | A 2 px `--ring` with a 2 px offset on every focusable element. It is never removed, and sticky bars never cover it. |
| Touch | Targets are at least 44 × 44 px, with at least 8 px between them. |
| Labels | Every input has a visible `<label>`; a placeholder is never the only label. Required fields say "(required)". |
| Errors | Errors appear inline under the field, with an icon and text, checked when you leave the field. After a failed submit, an error summary at the top (`role="alert"`, focused) links to each field. |
| Live updates | Toasts use `role="status"`, and Undo results are announced. While pairing, the code area is `aria-live="polite"`. |
| Structure | One `<h1>` per page, and headings in order. Landmarks: `nav`, `main` and `header`. Lists are real `<ul>` or `<ol>` elements. |
| Dates | Each month-grid cell has an `aria-label` such as "Thursday 19 November, 3 classes, 1 Deadline: Lab 4 report, due 16:30". |
| Reflow | The app works at 320 px wide and at 200% zoom with no sideways scrolling. |
| Authentication | Sign-in allows password managers and paste. No puzzles or CAPTCHAs (WCAG 3.3.8). |

---

## 4. Navigation

**Destinations.** Five are top level, which is the maximum for a bottom bar:

| Destination | Route | Icon | Contents |
|---|---|---|---|
| **Dashboard** | `/` | `LayoutDashboard` | Overdue, today, due soon, recent AI changes |
| **Timetable** | `/timetable` and `/calendar` | `CalendarDays` | Day, Week and Month views, switched with a segmented control |
| **Courses** | `/courses` | `BookOpen` | Courses, their Class Sessions and their Nicknames |
| **Deadlines** | `/assignments` and `/exams` | `ListChecks` | Assignments and Exams, switched with a segmented control (M1b; in M1a they live on the dashboard and the Course page) |
| **More** | n/a (a sheet) | `Menu` | Activity, Notes & resources (M2), Settings |

**Navigation layout:**
- **Phone, the bottom bar:**
  - icon and label for each item, never icon alone;
  - the current item uses `--primary` text and a `--primary-subtle` pill;
  - the **More** sheet lists Activity (with a count badge for unresolved items), Notes & resources, and Settings.
- **Tablet and desktop, the sidebar:**
  - the same order, with Activity, Notes & resources and Settings listed directly instead of under More;
  - the Course list collapses under Courses.
- **Top app bar (phone):** the page title, plus at most one action (usually the "Add" button), plus the More menu. On detail pages it shows a back arrow that returns to the screen you came from (browser history).

**Rules:**
- Every screen and every sheet or panel state has a URL (deep links), for example `/courses/[id]`, `/calendar?month=2026-11`, `/calendar?day=2026-11-19` and `/settings#whatsapp`.
- The browser's Back always works, and closing a sheet with Back returns to the page under it.
- Banners (§6.10) sit under the top bar on every page, so a disconnected WhatsApp is never missed.

---

## 5. Interaction patterns

| Pattern | Rule |
|---|---|
| **Button hierarchy** | At most **one primary** (filled teal) button per view. Others are secondary (outlined), ghost (text only, for less important actions) or destructive (filled red, only inside a confirmation). |
| **Adding things** | One "Add" button at the top right of the page, or in the top app bar on phones. It opens a **sheet** on phones (sliding up from the bottom) and a **dialog** on desktop, with the same form component inside. |
| **Editing** | Tapping a row opens its detail sheet, which has an Edit button. There is no editing inside the row, except the one-tap **Mark Submitted** checkbox on Assignments. |
| **Saving** | The Save button shows a spinner and is disabled while saving. On success: the sheet closes and a toast says "Saved". On failure: the sheet stays open with the error summary. |
| **Conflicts** | The AI changed the item while you were editing it. The form reloads with the latest values and a toast says "This item just changed. It has been reloaded with the latest values." You re-apply your edit if you still need it (U7). |
| **Destructive actions** | Deleting a Course, deleting the account or unlinking WhatsApp opens a confirmation dialog that names the item. Deleting a Course also requires typing its code. Archiving is offered first. |
| **Undo** | Every Auto Change row has an **Undo** button (secondary, with an icon and a label). When Undo isn't allowed, the button is disabled and the reason is shown underneath in muted text ("You edited this after the change"). An Undo is confirmed with a toast. Toasts never offer an "undo the undo". |
| **Toasts** | Bottom centre on phones (above the nav), bottom right on desktop. They disappear after 5 seconds, or stay until closed if they contain an action. Errors that need action are banners, not toasts. |
| **Loading** | Skeletons the same size as the content, shown for any wait over 300 ms. Never a blank page. |
| **Empty states** | An icon, one sentence saying what will appear here, and the one action that fills it ("No Courses yet. Add your first Course."). |
| **Errors** | Inline beside the field, or as a banner for page-level failures. Always say what happened and what to do ("Couldn't save. Check your connection and try again."). |
| **Lists** | Grouped by day under sticky date headers ("Today", "Tomorrow", "Fri 20 Nov"). Rows are at least 56 px tall. The whole row is the tap target. |
| **Segmented controls** | Day / Week / Month, Assignments / Exams, To do / Submitted. These are real radio groups (`role="radiogroup"`) with a 44 px height. The choice is kept in the URL. |
| **Pull to refresh** | None. Data refreshes when you open a page, and after every write. |

---

## 6. Components

The UI primitives come from shadcn/ui (file 56 in the design document): Button, Card, Dialog, AlertDialog, Sheet, Form, Input, Textarea, Select, Checkbox, RadioGroup, Badge, Tabs, Tooltip, DropdownMenu, Skeleton, Sonner and Alert. The app components below are made from them; their names match file 57 of the design document.

### 6.1 `deadline-item`

```text
┌──────────────────────────────────────────┐
│▌ CS2010 · Assignment            ☐ Submit │   ▌ = 4px course-colour bar
│▌ Lab 4 report                            │   title: text-body-strong
│▌ ⏱ Due Thu 19 Nov, 16:30 · in 2 days     │   meta: text-small, muted
│▌ ✨ Changed by WhatsApp · Moved later    │   (only for Auto Changes: warning badge)
└──────────────────────────────────────────┘
```

**States:**

| State | How it shows |
|---|---|
| Normal | As drawn above |
| **Due within 24 hours** | A `Clock` icon and the "Due today" or "Due tomorrow" label in `--warning` |
| **Overdue** | An `AlertCircle` icon and an "Overdue" badge in `--destructive` |
| **Submitted** | Checked, the title in muted text, and a "Submitted" badge with a check icon |
| **Time not announced** | "Due Fri 20 Nov · time not announced" |

**Behaviour:** the whole row (minimum 56 px) opens the detail sheet. The "Submit" checkbox is its own 44 px target, with the label "Mark Lab 4 report submitted".

### 6.2 `session-item` (one Occurrence)

```text
┌──────────────────────────────────────────┐
│ 10:00 │▌ CS2010 Lecture                  │
│ 12:00 │▌ Hall B2 · Dr. Perera            │
└──────────────────────────────────────────┘
```

**States:**

| State | How it shows |
|---|---|
| Normal | As drawn above |
| **Cancelled** | The title struck through, plus a "Cancelled" badge with `Ban` |
| **Rescheduled** | The new time, plus a "Moved from 10:00" note with `ArrowRightLeft` |
| **Extra** | An "Extra session" badge with `PlusCircle` |
| **Happening now** | A `--primary` "Now" badge |

### 6.3 `course-chip`

A dot in the Course colour, then the Course code in `text-small` weight 600 on a `--card` background, with an `--input` border and full rounding. It is used wherever a Course is named in a compact place.

### 6.4 `status-badge`

Always an icon plus a word, from a fixed set:

| Badge | Colour |
|---|---|
| Overdue | `--destructive` |
| Due today, Due tomorrow, Moved later, Check this | `--warning` |
| Submitted, Connected | `--success` |
| Cancelled, Archived, TBA | `--muted-foreground` on `--muted` |
| Now | `--primary` |

### 6.5 `auto-change-item` (Activity Log, dashboard)

```text
┌──────────────────────────────────────────┐
│ ✨ Lab 4 report: due Fri 20 → Thu 19 Nov │   summary
│ From CS2010 group · Kasun · 20:25        │   source line (muted)
│ "sorry, Lab 4 is due Thursday 4.30"      │   quoted message, 2 lines max, "Show more"
│                         [↶ Undo]         │   secondary button
└──────────────────────────────────────────┘
```

A change that moves a Deadline later, or cancels something, shows a `--warning` "Moved later" or "Cancelled" badge, and is highlighted for 7 days (U3). A blocked Undo shows its reason under a disabled button.

### 6.6 `unknown-course-item` and `possibly-missed-item`

- **`unknown-course-item`:** "Message mentions **DSA**, which isn't one of your Courses", the quoted message, then three buttons in one row (wrapping on narrow screens): **Add course**, **Nickname of…** (opens a Course picker), **Ignore**.
- **`possibly-missed-item`:** a `HelpCircle` icon and "This might be a deadline", the quoted message, then **Add Assignment** and **Add Exam**. Each opens the form pre-filled from the message. A **Dismiss** ghost button sits alongside.

### 6.7 `day-list` (timetable on phones; M1a everywhere)

A vertical list of `session-item`s for one day, with "‹ Wed 18 Nov ›" date navigation (44 px arrow buttons with `aria-label`s) and a "Today" button. Deadlines due that day show under a "Due" subheading below the classes.

### 6.8 `week-grid` (desktop, 1024 px and up; M1b)

Seven columns (Monday–Sunday) by hours 07:00–20:00, 48 px per hour. It's the timetable's default view from 1024 px; every block is at least 40 px tall (U18), overlapping classes sit side by side, and a class cut at 07:00 or 20:00 shows a small arrow at that edge. Each Occurrence is a block with its Course colour bar and code. Deadlines appear as chips in a strip across the top of each day. The current time is marked with a 2 px `--primary` line. The grid scrolls vertically inside the page; it never scrolls sideways.

### 6.9 `month-grid` and `day-sheet` (M1b)

```text
  ‹  November 2026  ›          [Day|Week|Month]
  Mo  Tu  We  Th  Fr  Sa  Su
 ┌───┬───┬───┬───┬───┬───┬───┐
 │ 16│ 17│ 18│ 19│ 20│ 21│ 22│
 │•••│•• │•••│•• │•  │   │   │   • = one class (course colour; cancelled = hollow grey)
 │   │   │   │▌CS│▌CS│   │   │   ▌CS = deadline chip (course code; red ring if Overdue)
 │   │   │   │+1 │   │   │   │   +1 = more deadlines than fit
 └───┴───┴───┴───┴───┴───┴───┘
```

**Each day cell:**
- is at least 44 × 56 px, and the whole cell is the tap target;
- shows the date number in `text-caption`;
- shows **one dot per class**, up to 4 and then "+n". Cancelled classes are hollow grey dots;
- shows **Deadline chips**: on phones, the Course code only; from 768 px up, the code and a shortened title. An Overdue chip has a `--destructive` ring and an icon;
- marks today with a `--primary` circle around the date. Days outside the month are in muted text.

**`day-sheet`** opens when a day is tapped. It is a bottom sheet under 768 px and a side panel from 768 px (like every other dialog), showing that day's `day-list`: its classes first, then its Deadlines. The URL becomes `/calendar?month=YYYY-MM&day=YYYY-MM-DD`; `/calendar?day=YYYY-MM-DD` alone opens that day's month with the sheet. On phones the grid runs edge to edge, so seven 44 px cells fit at 320 px.

### 6.10 `banner`

A full-width strip under the top bar, coloured by its kind's `-subtle` token, with an icon, one sentence, and one action.

| Kind | Text | Action |
|---|---|---|
| WhatsApp disconnected | "WhatsApp disconnected since 14:02. New announcements aren't being read." | **Re-link** → `/settings#whatsapp` |
| Worker unhealthy | "Reminders may be delayed. We've been alerted." | none |
| AI unavailable | "Auto Changes are delayed. Messages are queued and will be processed." | none |
| Auto Changes paused | "Auto Changes are paused." | **Resume** |

At most two banners show at once, most severe first.

### 6.11 Forms

All forms share these components:

- **Text fields:** a label above, the input, helper text, and an inline error underneath.
- **Date fields:** a native `type="date"` input, which is reliable and accessible on phones, labelled "Due date".
- **Time fields:** a native `type="time"` input in 24-hour form. Leaving the time empty shows the helper text "Leave empty if no time was announced (treated as 23:59)".
- **Course fields:** a `Select` of the Student's Courses, showing a `course-chip` for each.
- **Colour fields:** a radio group of the 7 course colours. Each swatch is 44 px and carries the colour's name as its accessible label.
- **Actions:** the primary action sits at the bottom right on desktop. On phones it is full width at the bottom of the sheet, above the safe area.

### 6.12 Other shared components

- **`empty-state`:** a 48 px muted icon, a sentence, and one primary or secondary action.
- **`section-header`:** a `text-title` heading, an optional count, and an optional "See all" link.
- **`semester-manager`, `nickname-editor`, `whatsapp-pairing`, `group-linker`:** described in their screens (§7.6 and §7.2).

---

## 7. Main screens

The wireframes are at phone width (375 px), with notes on how each screen changes on desktop. "M1a", "M1b" and "M2" say which release each screen or part ships in.

### 7.1 Dashboard (`/`, M1a)

```text
┌─────────────────────────────────────┐
│ Dashboard                     [+ ▾] │  top bar; "+" menu: Assignment, Exam
├─────────────────────────────────────┤
│ ⚠ WhatsApp disconnected since 14:02 │  banner (only when needed)
│   [Re-link]                         │
├─────────────────────────────────────┤
│ Overdue (1)                         │  section-header, destructive count
│ ┌ deadline-item  ⛔ Overdue ───────┐ │
├─────────────────────────────────────┤
│ Today · Thu 19 Nov                  │
│ ┌ session-item 10:00 CS2010 Lect ─┐ │
│ ┌ session-item 14:00 CS2020 Lab ✕ ┐ │  cancelled shown, struck through
│ ┌ deadline-item Due 16:30 ────────┐ │
├─────────────────────────────────────┤
│ Due soon (next 14 days)    See all ›│
│ Tomorrow                            │  sticky day headers
│ ┌ deadline-item ──────────────────┐ │
│ Mon 23 Nov                          │
│ ┌ deadline-item ──────────────────┐ │
├─────────────────────────────────────┤
│ Exams with date TBA (1)             │  collapsed by default
├─────────────────────────────────────┤
│ Check these (2)                     │  highlighted Auto Changes (moved later,
│ ┌ auto-change-item  Moved later ──┐ │  cancelled) for 7 days
├─────────────────────────────────────┤
│ Recent changes (48 h)   Activity ›  │
│ ┌ auto-change-item ───────────────┐ │
└─────────────────────────────────────┘
│ ▣Dash   ▤Timetable  ▥Courses ☰More │  bottom nav
```

- **Order** (fixed, deadlines first): Overdue → Today → Due soon → TBA Exams → Check these → Recent changes.
- **Desktop:** two columns. The left column (8 of 12) holds Overdue, Today and Due soon. The right column (4 of 12) holds Check these, Recent changes and TBA Exams.
- **Empty state** (a new account): "Add your Courses and the Deadlines you already know about." with the actions **Add Course** and **Link WhatsApp**.

### 7.2 Course management (`/courses`, `/courses/[id]`, M1a)

```text
Courses list                         Course detail
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ Courses                [+ Add]│    │ ‹ CS2010                  [⋯] │  ⋯: Edit, Archive, Delete
│ Year 2 · Semester 1 ▾         │    │ ▌Data Structures              │
├───────────────────────────────┤    │  Dr. Perera · Group linked ✓  │
│ ▌CS2010 Data Structures     › │    ├───────────────────────────────┤
│  2 classes/wk · 3 due soon    │    │ [Classes|Assignments|Exams]   │  segmented control
│ ▌CS2020 Databases           › │    │ Weekly classes                │
│  3 classes/wk · 1 due soon    │    │ Thu 10:00–12:00 Lecture B2  › │
│ ▌MA2001 Statistics          › │    │ Mon 14:00–16:00 Lab L3      › │
│  2 classes/wk · nothing due   │    │ [+ Add class]                 │
├───────────────────────────────┤    │ Upcoming changes              │
│ Archived (4)                ▾ │    │ Thu 26 Nov lecture cancelled  │
└───────────────────────────────┘    ├───────────────────────────────┤
                                     │ Nicknames                     │
                                     │ [DS ×] [data structures ×]    │  nickname-editor
                                     │ [+ Add nickname]              │
                                     └───────────────────────────────┘
```

- **Semester picker:** a `Select` in the header. It defaults to the current Semester; Semesters themselves are managed in Settings.
- **Course form:** code (required), name (required), lecturer, colour (radio swatches), Semester.
- **The ⋯ menu:**
  - Archive asks "Archive CS2010?", and the Course and its data stay available.
  - **Delete** opens a destructive confirmation that requires typing the Course code. It explains that the Course's Class Sessions, Assignments, Exams and Nicknames are deleted, and its WhatsApp group is unlinked.
- **Desktop:** the list and the detail sit side by side (list 4 of 12, detail 8 of 12).

### 7.3 Assignment management (M1a: on the Course page and dashboard; M1b: `/assignments`)

```text
Deadlines (M1b)                      Assignment sheet (add / edit)
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ Deadlines              [+ Add]│    │ New Assignment             ✕  │
│ [Assignments | Exams]         │    │ Course (required)             │
│ [To do | Submitted]  Course ▾ │    │ [▌CS2010 Data Structures   ▾] │
├───────────────────────────────┤    │ Title (required)              │
│ Overdue                       │    │ [Lab 4 report               ] │
│ ┌ deadline-item ────────────┐ │    │ Due date (required)           │
│ This week                     │    │ [2026-11-19]                  │
│ ┌ deadline-item ────────────┐ │    │ Due time                      │
│ ┌ deadline-item ────────────┐ │    │ [16:30]                       │
│ Later                         │    │ Leave empty if no time was    │
│ ┌ deadline-item ────────────┐ │    │ announced (treated as 23:59). │
└───────────────────────────────┘    │ Where to submit               │
                                     │ [LMS                        ] │
                                     │ ☐ Group work                  │
                                     │ Description                   │
                                     │ [                           ] │
                                     │ [        Save Assignment    ] │  primary, full width
                                     └───────────────────────────────┘
```

- **The Assignment detail sheet** shows every field, a status selector (To do / In progress / Submitted), and where the Assignment came from ("Added by you" or "From CS2010 group, 9 Nov 20:15", which links to the Activity Log entry). Its actions are Edit and Delete.
- **The Exam form** has the same layout, with Kind, Date ("Leave empty if TBA"), Start time, Location and Topics.
- **Filters** (status, Course) are kept in the URL.

### 7.4 Lecture timetable (`/timetable` and `/calendar`)

```text
Day (M1a, all widths)                Month (M1b)
┌───────────────────────────────┐    ┌───────────────────────────────┐
│ Timetable                     │    │ Timetable                     │
│ [Day | Week | Month]          │    │ [Day | Week | Month]          │  Week hidden < 1024px
│ ‹  Thu 19 Nov  ›     [Today]  │    │ ‹  November 2026  ›           │
├───────────────────────────────┤    │ month-grid (see §6.9)         │
│ 10:00 ▌CS2010 Lecture  Now    │    │                               │
│ 12:00 ▌Hall B2                │    │                               │
│ 14:00 ▌CS2020 Lab   Cancelled │    │                               │
│ 16:00 ▌Lab L3 (struck)        │    ├───────────────────────────────┤
├───────────────────────────────┤    │ Tap a day → day-sheet         │
│ Due                           │    │ Thu 19 Nov                    │
│ ┌ deadline-item 16:30 ──────┐ │    │ 2 classes · 1 Deadline        │
└───────────────────────────────┘    └───────────────────────────────┘
```

- **In M1a,** the Week and Month options are hidden; only the day list exists.
- **In M1b, under 1024 px,** the segmented control shows Day and Month only.
- **Tapping a class** opens its Occurrence sheet. It shows the times, location and any change, plus the actions **Cancel this class**, **Reschedule** and **Edit weekly class**. These are for the Student to correct the timetable; the AI usually makes these changes.

### 7.5 Notes and resources (`/courses/[id]/notes`, M2, not in M1)

This screen is designed now, so M1's navigation already has a place for it. **It isn't built until M2** (CONTEXT.md).

```text
┌───────────────────────────────┐
│ ‹ CS2010 · Notes       [+ Add]│
│ [Search notes…              ] │  search box, 44px
├───────────────────────────────┤
│ 📌 From WhatsApp (auto)     › │  pinned note: files posted in groups (M3)
│   12 files · updated today    │
│ Week 5 – Trees              › │
│   2 attachments · 18 Nov      │
│ Exam revision               › │
│   1 attachment · 10 Nov       │
├───────────────────────────────┤
│ Note detail                   │
│ # Week 5 – Trees              │  formatted text (headings, lists, code)
│ Attachments                   │
│ [FileText lecture5.pdf 2.1MB] │  opens via short-lived link
│ [+ Attach PDF (max 20 MB)]    │
└───────────────────────────────┘
```

(The 📌 in the sketch stands in for a Lucide `Pin` icon; the app itself never uses emoji.)

- **Editor:** a toolbar of 44 px buttons (Heading, Bold, List, Link, Code), each with an `aria-label`.
- **Uploading:** a progress bar during upload. A file over 20 MB shows the inline error "Files must be 20 MB or smaller".
- **More menu:** in M1 the "Notes & resources" item reads "Coming soon" and is disabled. It still has a visible label, because a disabled item that vanishes would be confusing.

### 7.6 User settings (`/settings`, M1a)

```text
┌───────────────────────────────┐
│ Settings                      │
├───────────────────────────────┤
│ Semesters                     │  semester-manager
│ ● Year 2 · Sem 1  (current)  ⋯│  ⋯: Edit dates, Archive
│ ○ Year 1 · Sem 2  (archived)  │
│ [+ Add Semester]              │
├───────────────────────────────┤
│ WhatsApp            ✓Connected│  #whatsapp
│ Linked groups                 │  group-linker
│ CS2010 group   → [CS2010   ▾] │
│ Batch 22 group → [Semester ▾] │
│ Family         → [Not linked▾]│
│ Auto Changes        [On  ◉   ]│  switch; off = paused
│ [Unlink WhatsApp]             │  secondary → confirm
├───────────────────────────────┤
│ Account                       │
│ Email  you@gmail.com          │
│ [Change password]             │
├───────────────────────────────┤
│ Danger zone                   │
│ [Delete my account]           │  destructive outline → confirm dialog
└───────────────────────────────┘
```

**WhatsApp pairing** (`whatsapp-pairing`, phone-number code only, U1):

1. **Phone number:** a field with the helper text "Digits with country code, e.g. 94771234567".
2. **The code:** shown in large, spaced characters, with the instructions "WhatsApp → Settings → Linked devices → Link with phone number". The area is announced politely to screen readers, and a 3-minute countdown is shown.
3. **The result:** "Connected", with the success icon. On failure, a readable error with a "Try again" button (timeout, or the linked-device limit).

**The other settings:**
- **Group linking:** every WhatsApp group is listed, with a select (Not linked, the Semester, or a Course). The helper text reads "Only linked groups are read. Other chats are ignored."
- **Time zone:** there's no setting. The app shows "Times are in Sri Lanka time (Asia/Colombo)" (U2).
- **Account deletion:** a confirmation dialog that needs your password. It lists what is deleted, and says that backups age out within 7 days.

### 7.7 Supporting screens

- **Sign-in** (`/login`): a centred card, 400 px at most, with the product name, email, password (with a show/hide toggle), **Sign in**, and a "Forgot password?" link. Errors: "Email or password is incorrect", and for rate limiting, "Too many attempts, try again in a minute". There's no sign-up link: v1 has one Student.
- **Reset password** (`/reset-password`): a request form that always replies "If the email exists, a link has been sent", and a set-new-password form with the 12-character rule shown as helper text.
- **Activity** (`/activity`): a feed of `auto-change-item`, `unknown-course-item` and `possibly-missed-item` entries, newest first, with filter chips (All, Changes, Needs attention). M1b adds Undo batch and the event items.

---

## 8. Copy guidelines

- **Words:** use the glossary terms in the interface: "Course", not "Module" or "Subject"; "Assignment", not "Task"; "Class" in labels for a Class Session.
- **Voice:** sentence case everywhere. Plain, short and direct.
  - Buttons start with a verb: "Add Assignment", "Re-link", "Mark Submitted".
  - Errors say what to do next.
- **Relative times** go with absolute ones: "in 2 days · Thu 19 Nov, 16:30".
- **AI changes** are always attributed: "Changed by WhatsApp message from Kasun".

---

## 9. Tokens for implementation

Phase P1 maps these values into `src/app/globals.css` as shadcn semantic variables: hex here, converted to OKLCH at implementation, exposed through Tailwind 4's `@theme inline`. Names follow shadcn's conventions, plus `--primary-hover`, `--primary-subtle`, `--warning*`, `--success*` and `--destructive-subtle`. `--radius` is `10px`. The font is set with `--font-sans: "Plus Jakarta Sans", system-ui, sans-serif`. The Course colours are stored by name on the Course (`blue`, `violet`, `pink`, `orange`, `cyan`, `olive`, `slate`) and mapped to hex in one place.

---

## 10. Source and deviations

Generated with UI UX Pro Max 2.15.0. The query was `"student productivity planner deadlines" --design-system`, with variance 3, motion 2 and density 6, followed by focused `ux` searches (bottom navigation, touch targets, inline validation, color-only status, empty states) and the `shadcn` stack theming guidance.

**Kept from the recommendation:**
- the Minimalism / Swiss style;
- Plus Jakarta Sans;
- a teal primary;
- subtle 150–250 ms transitions;
- its checklist: SVG icons (no emoji), visible focus, reduced motion, testing at 375, 768, 1024 and 1440 px.

**Changed, with reasons:**

| Recommendation | Changed to | Why |
|---|---|---|
| "Product Demo + Features" landing pattern | App screens (§7) | Course-manager has no marketing page |
| Primary `#0D9488` with black text | `#0F766E` with white text | White text on `#0D9488` is only 3.7:1; `#0F766E` gives 5.5:1, and white on teal reads as the standard primary button |
| A second, orange accent `#EA580C` | Removed | The requirement is one accent colour |
| Teal-tinted background `#F0FDFA` and border `#99F6E4` | Neutral slate background and borders | A tinted page competes with the accent and the Course colours |
| GSAP scroll reveal | CSS transitions only | No decorative motion in a productivity app; one fewer dependency |

## 11. Pre-delivery checklist (for every screen ticket)

- [ ] Uses tokens only; no raw hex values or palette classes in components.
- [ ] At most one primary button per view; teal is used only for actions, the current place and focus.
- [ ] Every status has an icon and a word; Course colour always comes with its code.
- [ ] Touch targets are at least 44 × 44 px, with at least 8 px between them; body text is at least 16 px; inputs are 16 px.
- [ ] Visible focus everywhere; keyboard path checked; sheets trap and return focus.
- [ ] Labels visible; inline errors; error summary on submit.
- [ ] Loading skeletons, an empty state, and an error state are designed.
- [ ] Checked at 320, 375, 768, 1024 and 1440 px, and at 200% zoom: no sideways scroll, and the bottom nav doesn't cover content.
- [ ] `prefers-reduced-motion` respected.
- [ ] Every view state has a URL; browser Back behaves.
- [ ] Lucide icons only; icon-only buttons have an `aria-label`.
