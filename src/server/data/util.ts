/** True when a Postgres error (possibly wrapped by Drizzle) is a unique violation of `constraint`. */
export function isUniqueViolation(e: unknown, constraint: string) {
  const pg = ((e as { cause?: unknown })?.cause ?? e) as { code?: string; constraint?: string };
  return pg?.code === "23505" && pg.constraint === constraint;
}

export const iso = (d: Date | null) => (d ? d.toISOString() : null);
