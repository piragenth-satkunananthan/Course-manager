// Shown while a Deadlines list loads (design-system §5): the same shape as the page, so nothing jumps.
export function DeadlinesSkeleton() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-9 w-48 rounded-md bg-muted" />
        <div className="h-11 w-24 rounded-md bg-muted md:h-10" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <div className="h-[52px] w-56 rounded-md bg-muted" />
        <div className="h-[52px] w-48 rounded-md bg-muted" />
        <div className="h-11 w-52 rounded-md bg-muted md:h-10" />
      </div>
      {[2, 3].map((rows, g) => (
        <div key={g} className="mt-6">
          <div className="h-7 w-32 rounded-md bg-muted" />
          <div className="mt-2 space-y-2">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="h-24 rounded-md bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
