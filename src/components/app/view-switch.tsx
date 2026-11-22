"use client";
// The timetable's Day / Week / Month segmented control (design-system §7.4). Week is offered from 1024 px only;
// below that the day list is shown. Month is /calendar (#20).
import { useMediaQuery } from "@/hooks/use-media-query";
import { Segmented } from "./segmented";

export type View = "day" | "week" | "month";

export function ViewSwitch({ view, hrefs }: { view: View; hrefs: Record<View, string> }) {
  // Under 1024 px a week URL shows the day list, so Day is the one shown as chosen. The server assumes a wide screen,
  // so desktop never flickers; only a phone opening a week link switches to Day after loading.
  const wide = useMediaQuery("(min-width: 1024px)", true);
  const shown: View = view === "week" && !wide ? "day" : view;
  return (
    <Segmented
      label="View"
      value={shown}
      options={[
        { value: "day", label: "Day", href: hrefs.day },
        { value: "week", label: "Week", href: hrefs.week, className: "max-lg:hidden" },
        { value: "month", label: "Month", href: hrefs.month },
      ]}
    />
  );
}
