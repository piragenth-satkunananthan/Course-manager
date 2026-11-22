"use client";
// An on/off switch (Radix): a 44 px tap target on phones, 40 px from md (design-system §3), around a small track.
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn("group inline-flex h-11 w-16 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:h-10", className)}
      {...props}
    >
      <span className="inline-flex h-6 w-11 items-center rounded-full bg-muted-foreground/40 transition-colors group-data-[state=checked]:bg-primary">
        <SwitchPrimitive.Thumb className="ml-0.5 block size-5 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-5" />
      </span>
    </SwitchPrimitive.Root>
  );
}
