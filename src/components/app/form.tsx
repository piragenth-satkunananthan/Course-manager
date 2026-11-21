"use client";
// Shared form pieces (design-system §3, §6.11): visible labels, inline errors, and a focused error summary after submit.
import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Controller, type Control, type FieldErrors, type FieldPath, type FieldValues, type UseFormReturn } from "react-hook-form";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ApiError } from "@/lib/api-fetch";

/** Puts a server error onto the form: field errors on their fields, anything else as the form's root error. */
export function applyServerError<T extends FieldValues>(form: UseFormReturn<T, unknown, unknown>, error: ApiError) {
  const fields = Object.entries(error.fieldErrors ?? {});
  for (const [name, message] of fields) form.setError(name as FieldPath<T>, { message });
  if (!fields.length) form.setError("root", { message: error.message });
}

export function ErrorSummary({ errors, labels, submitCount }: { errors: FieldErrors; labels: Record<string, string>; submitCount: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors).filter(([k]) => k !== "root");
  const root = errors.root?.message;
  const show = submitCount > 0 && (entries.length > 0 || !!root);
  useEffect(() => {
    if (show) ref.current?.focus();
  }, [show, submitCount]);
  if (!show) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-sm bg-destructive-subtle p-3 text-sm font-medium text-destructive">
      <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
      <div>
        {root && <p>{root}</p>}
        {entries.length > 0 && (
          <ul>
            {entries.map(([name, e]) => (
              <li key={name}>
                <a href={`#${name}`} className="underline">
                  {labels[name] ?? name}: {String(e?.message)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type TextFieldProps<T extends FieldValues> = {
  control: Control<T, unknown, unknown>;
  name: FieldPath<T>;
  label: string;
  required?: boolean;
  type?: string;
  help?: string;
  autoComplete?: string;
};

export function TextField<T extends FieldValues>({ control, name, label, required, type = "text", help, autoComplete }: TextFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={name}>
            {label}
            {required && " (required)"}
          </FieldLabel>
          <Input
            {...field}
            value={field.value ?? ""}
            id={name}
            type={type}
            autoComplete={autoComplete}
            aria-invalid={fieldState.invalid}
            aria-describedby={fieldState.error ? `${name}-error` : help ? `${name}-help` : undefined}
          />
          {help && !fieldState.error && <FieldDescription id={`${name}-help`}>{help}</FieldDescription>}
          {fieldState.error && <FieldError id={`${name}-error`} errors={[fieldState.error]} />}
        </Field>
      )}
    />
  );
}
