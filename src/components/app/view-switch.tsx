"use client";
// The timetable's Day / Week segmented control (design-system §3, §7.4): a radio group kept in the URL. Week is
// offered from 1024 px only; below that the day list is shown. Month joins with #20.
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";

const WIDE = "(min-width: 1024px)";
const subscribe = (onChange: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
};

export type View = "day" | "week";

export function ViewSwitch({ view, hrefs }: { view: View; hrefs: Record<View, string> }) {
  const router = useRouter();
  // Under 1024 px a week URL shows the day list, so Day is the one shown as chosen. The server assumes a wide screen,
  // so desktop never flickers; only a phone opening a week link switches to Day after loading.
  const wide = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => true);
  const shown: View = view === "week" && !wide ? "day" : view;
  const item = "inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary-subtle data-[state=checked]:text-primary md:min-h-10";
  return (
    <RadioPrimitive.Root aria-label="View" value={shown} onValueChange={(v) => router.push(hrefs[v as View])} className="inline-flex rounded-md border border-input p-1">
      <RadioPrimitive.Item value="day" className={item}>Day</RadioPrimitive.Item>
      <RadioPrimitive.Item value="week" className={`${item} max-lg:hidden`}>Week</RadioPrimitive.Item>
    </RadioPrimitive.Root>
  );
}
