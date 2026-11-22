"use client";
// A segmented control (design-system §3): a real radio group whose choice lives in the URL. Choosing an option
// navigates to its link. Shared by the timetable's Day / Week / Month and the Deadlines lists' switches. `chips`
// draws the same radio group as filter chips (full radius, §2.3), for the Activity Log's filters.
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";

export type Segment = { value: string; label: string; href: string; className?: string };

export function Segmented({ label, value, options, variant = "segmented" }: { label: string; value: string; options: Segment[]; variant?: "segmented" | "chips" }) {
  const router = useRouter();
  const item = "inline-flex min-h-11 items-center justify-center rounded-sm px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:bg-primary-subtle data-[state=checked]:text-primary md:min-h-10";
  const chips = variant === "chips";
  const chip = "inline-flex min-h-11 items-center justify-center rounded-full border border-input px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=checked]:border-primary data-[state=checked]:bg-primary-subtle data-[state=checked]:text-primary md:min-h-10";
  return (
    <RadioPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => router.push(options.find((o) => o.value === v)!.href)}
      className={chips ? "flex flex-wrap gap-2" : "inline-flex rounded-md border border-input p-1"}
    >
      {options.map((o) => (
        <RadioPrimitive.Item key={o.value} value={o.value} className={`${chips ? chip : item} ${o.className ?? ""}`}>{o.label}</RadioPrimitive.Item>
      ))}
    </RadioPrimitive.Root>
  );
}
