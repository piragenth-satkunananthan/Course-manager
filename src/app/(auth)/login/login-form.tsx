"use client";

import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

const inputClass = "mt-1 block min-h-11 w-full rounded-sm border border-input bg-card px-3 text-base aria-invalid:border-destructive md:min-h-10";
type Field = "email" | "password";
const REQUIRED: Record<Field, string> = { email: "Enter your email", password: "Enter your password" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 flex items-center gap-1 text-sm text-destructive">
      <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" />
      {message}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error || Object.keys(fieldErrors).length) summary.current?.focus();
  }, [error, fieldErrors]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const values = { email: String(form.get("email")).trim(), password: String(form.get("password")) };
    const missing = Object.fromEntries((Object.keys(REQUIRED) as Field[]).filter((f) => !values[f]).map((f) => [f, REQUIRED[f]]));
    setFieldErrors(missing);
    setError(undefined);
    if (Object.keys(missing).length) return;

    setPending(true);
    const { error } = await authClient.signIn.email(values);
    setPending(false);
    if (!error) return router.replace("/");
    setError(error.status === 429 ? "Too many attempts, try again in a minute" : "Email or password is incorrect");
  }

  const problems = [error, ...Object.values(fieldErrors)].filter(Boolean);
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      {problems.length > 0 && (
        <div ref={summary} tabIndex={-1} role="alert" className="flex items-start gap-2 rounded-sm bg-destructive-subtle p-3 text-sm font-medium text-destructive">
          <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          {error ?? (
            <ul>
              {(Object.keys(fieldErrors) as Field[]).map((f) => (
                <li key={f}>
                  <a href={`#${f}`} className="underline">{fieldErrors[f]}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div>
        <label htmlFor="email" className="text-sm font-medium">Email (required)</label>
        <input
          id="email" name="email" type="email" autoComplete="username" required
          aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className={inputClass}
        />
        <FieldError id="email-error" message={fieldErrors.email} />
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium">Password (required)</label>
        <div className="relative">
          <input
            id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
            aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "password-error" : undefined}
            className={`${inputClass} pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            title={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
          >
            {showPassword ? <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" /> : <Eye size={20} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
        <FieldError id="password-error" message={fieldErrors.password} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 md:min-h-10"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
