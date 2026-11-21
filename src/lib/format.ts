// Display formats (design-system §2.2): "Fri 20 Nov", 24-hour times. Local dates are plain YYYY-MM-DD values,
// so they're formatted in UTC to keep the day unchanged.
export function formatDate(isoDate: string, { weekday = true, year = false } = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(weekday ? { weekday: "short" } : {}),
    ...(year ? { year: "numeric" } : {}),
  })
    .format(new Date(`${isoDate}T00:00:00Z`))
    .replace(",", "");
}
