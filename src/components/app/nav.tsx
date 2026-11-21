"use client";
// Sidebar from 768 px, bottom bar below (design-system §4). One list of destinations for both.
import { Activity, BookOpen, CalendarDays, LayoutDashboard, ListChecks, Menu, Settings, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: LucideIcon };
const MAIN: Item[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timetable", label: "Timetable", icon: CalendarDays },
  { href: "/courses", label: "Courses", icon: BookOpen },
  { href: "/assignments", label: "Deadlines", icon: ListChecks },
];
const MORE: Item[] = [
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

const isCurrent = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function NavLink({ item, path, className }: { item: Item; path: string; className: string }) {
  const current = isCurrent(path, item.href);
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`${className} rounded-md text-sm font-medium transition-colors duration-150 ${current ? "bg-primary-subtle text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      <item.icon size={20} strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export function NavSidebar() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-y-0 left-0 hidden w-[72px] border-r border-border bg-card p-2 md:block lg:w-60 lg:p-4">
      <p className="mb-6 hidden px-3 text-heading font-semibold lg:block">Course-manager</p>
      <ul className="space-y-1">
        {[...MAIN, ...MORE].map((item) => (
          <li key={item.href}>
            <NavLink item={item} path={path} className="flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-xs lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm" />
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function NavBottom() {
  const path = usePathname();
  const moreCurrent = MORE.some((i) => isCurrent(path, i.href));
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid h-16 grid-cols-5 gap-1 px-1">
        {MAIN.map((item) => (
          <li key={item.href} className="flex">
            <NavLink item={item} path={path} className="my-1 flex flex-1 flex-col items-center justify-center gap-0.5 text-xs" />
          </li>
        ))}
        <li className="flex">
          <button
            popoverTarget="more-menu"
            className={`my-1 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium ${moreCurrent ? "bg-primary-subtle text-primary" : "text-muted-foreground"}`}
          >
            <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
      {/* Native popover: Esc and outside taps close it, and focus returns to the button. */}
      <div id="more-menu" popover="auto" className="mx-4 mt-auto mb-20 w-[calc(100%-2rem)] rounded-lg border border-border bg-card p-2 shadow-md">
        <ul>
          {MORE.map((item) => (
            <li key={item.href}>
              <NavLink item={item} path={path} className="flex min-h-11 items-center gap-3 px-3" />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
