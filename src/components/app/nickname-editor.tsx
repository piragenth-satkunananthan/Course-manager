"use client";
// Add and remove a Course's Nicknames (design-system §7.2): how people refer to it in WhatsApp, for the AI.
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import { type Nickname, NicknameCreate } from "@/shared/schemas/course";
import { applyServerError, ErrorSummary, TextField } from "./form";

export function NicknameEditor({ courseId, code, nicknames }: { courseId: string; code: string; nicknames: Nickname[] }) {
  const router = useRouter();
  const form = useForm<z.input<typeof NicknameCreate>, unknown, z.output<typeof NicknameCreate>>({
    shouldFocusError: false, // the error summary takes focus instead (design-system §3)
    resolver: zodResolver(NicknameCreate),
    defaultValues: { nickname: "" },
  });
  const { isSubmitting, errors, submitCount } = form.formState;

  async function add(values: z.output<typeof NicknameCreate>) {
    const res = await apiFetch<Nickname>(`/courses/${courseId}/nicknames`, { method: "POST", body: values });
    if (!res.ok) return applyServerError(form, res.error);
    form.reset();
    toast.success(`Added "${res.data.nickname}"`);
    router.refresh();
  }

  async function remove(n: Nickname) {
    const res = await apiFetch(`/nicknames/${n.id}`, { method: "DELETE" });
    if (!res.ok) return void toast.error(res.error.message);
    toast.success(`Removed "${n.nickname}"`);
    router.refresh();
  }

  return (
    <section aria-labelledby="nicknames-heading" className="rounded-md border border-border bg-card p-4 md:p-6">
      <h2 id="nicknames-heading" className="text-title font-semibold">Nicknames</h2>
      <p className="mt-1 text-sm text-muted-foreground">How your groups refer to {code}, such as &quot;DS&quot;. The AI uses these to match messages to this Course.</p>
      {nicknames.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Nicknames">
          {nicknames.map((n) => (
            <li key={n.id} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border pl-3">
              {n.nickname}
              <Button variant="ghost" size="icon" className="rounded-full" aria-label={`Remove ${n.nickname}`} title="Remove" onClick={() => remove(n)}>
                <X size={20} strokeWidth={1.75} aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No nicknames yet.</p>
      )}
      <form onSubmit={form.handleSubmit(add)} noValidate className="mt-4 space-y-3">
        <ErrorSummary errors={errors} submitCount={submitCount} labels={{ nickname: "Nickname" }} />
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <TextField control={form.control} name="nickname" label="Add a nickname" />
          </div>
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            Add
          </Button>
        </div>
      </form>
    </section>
  );
}
