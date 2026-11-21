// The "most recently sent wins" rule, per field (design §3, file 24). Undo planning arrives with #12.

export type FieldSetAt = Record<string, string>; // field → ISO instant its value was set

/**
 * Plans an update: only fields the writer owns, only if the write is at least as new as each field's
 * current value, and only fields whose value actually changes. `noChange` means nothing is written.
 */
export function planFieldUpdate(
  current: Record<string, unknown>,
  fieldSetAt: FieldSetAt,
  proposed: Record<string, unknown>,
  setAt: string,
  owned: readonly string[],
) {
  const fields: Record<string, unknown> = {};
  const newFieldSetAt: FieldSetAt = { ...fieldSetAt };
  for (const [field, value] of Object.entries(proposed)) {
    if (!owned.includes(field) || value === undefined) continue;
    if (fieldSetAt[field] && setAt < fieldSetAt[field]) continue; // newer information already set this field
    if (value === current[field]) continue;
    fields[field] = value;
    newFieldSetAt[field] = setAt;
  }
  return { fields, newFieldSetAt, noChange: Object.keys(fields).length === 0 };
}
