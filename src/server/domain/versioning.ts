// The "most recently sent wins" rule, per field (design §3, file 24). Undo planning arrives with #12.

export type FieldSetAt = Record<string, string>; // field → ISO instant its value was set

/**
 * Plans an update: only fields the writer owns, and only fields whose value actually changes. A message
 * (AI or system) must also be later than each field's set time; a Student edit always applies (§3).
 * `noChange` means nothing is written.
 */
export function planFieldUpdate(
  current: Record<string, unknown>,
  fieldSetAt: FieldSetAt,
  proposed: Record<string, unknown>,
  setAt: string,
  owned: readonly string[],
  actor: "ai" | "student" | "system",
) {
  const fields: Record<string, unknown> = {};
  const newFieldSetAt: FieldSetAt = { ...fieldSetAt };
  for (const [field, value] of Object.entries(proposed)) {
    if (!owned.includes(field) || value === undefined) continue;
    if (actor !== "student" && fieldSetAt[field] && Date.parse(setAt) <= Date.parse(fieldSetAt[field])) continue; // not later than what set it
    if (value === current[field]) continue;
    fields[field] = value;
    newFieldSetAt[field] = setAt;
  }
  return { fields, newFieldSetAt, noChange: Object.keys(fields).length === 0 };
}
