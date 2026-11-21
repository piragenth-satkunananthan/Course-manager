// Shown while a page's data loads (design-system §5: skeletons, never a blank page).
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" aria-busy="true" className="animate-pulse">
      <div className="h-9 w-48 rounded-md bg-muted" />
      <div className="mt-6 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
