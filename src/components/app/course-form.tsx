"use client";
// Add or edit a Course (design-system §7.2): code, name, lecturer, colour swatches, and the Semester when adding.
import { Check } from "lucide-react";
import { Controller } from "react-hook-form";
import { toast } from "sonner";
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-fetch";
import { COLOUR_BG, COLOUR_LABEL } from "@/lib/course-colours";
import { Course, COURSE_COLOURS, CourseCreate } from "@/shared/schemas/course";
import type { Semester } from "@/shared/schemas/semester";
import { applyServerError, ErrorSummary, SaveButton, TextField, useAppForm } from "./form";

const LABELS = { semesterId: "Semester", code: "Code", name: "Name", lecturerName: "Lecturer", colour: "Colour" };

type Props = { semesters: Semester[]; defaultSemesterId?: string; course?: Course; onDone: (course: Course) => void };

export function CourseForm({ semesters, defaultSemesterId, course, onDone }: Props) {
  const form = useAppForm(
    CourseCreate,
    course
      ? { semesterId: course.semesterId, code: course.code, name: course.name, lecturerName: course.lecturerName ?? "", colour: course.colour }
      : { semesterId: defaultSemesterId ?? "", code: "", name: "", lecturerName: "", colour: undefined },
  );
  const { isSubmitting, errors, submitCount } = form.formState;

  async function onSubmit({ semesterId, ...rest }: CourseCreate) {
    const res = course
      ? await apiFetch(`/courses/${course.id}`, { method: "PATCH", body: rest, schema: Course })
      : await apiFetch("/courses", { method: "POST", body: { semesterId, ...rest }, schema: Course });
    if (!res.ok) return applyServerError(form, res.error);
    toast.success("Saved");
    onDone(res.data);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={LABELS} />
      {!course && (
        <Controller
          control={form.control}
          name="semesterId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="semesterId">Semester (required)</FieldLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="semesterId" className="w-full" aria-invalid={fieldState.invalid} aria-describedby={fieldState.error ? "semesterId-error" : undefined}>
                  <SelectValue placeholder="Choose a Semester" />
                </SelectTrigger>
                <SelectContent>
                  {semesters.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldState.error && <FieldError id="semesterId-error" errors={[fieldState.error]} />}
            </Field>
          )}
        />
      )}
      <TextField control={form.control} name="code" label="Code" required help="For example CS2010" />
      <TextField control={form.control} name="name" label="Name" required />
      <TextField control={form.control} name="lecturerName" label="Lecturer" />
      <Controller
        control={form.control}
        name="colour"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid}>
            <FieldLegend variant="label" id="colour">Colour (required)</FieldLegend>
            {/* 44 px swatches, each named for screen readers; the chosen one gets a ring and a tick, not colour alone. */}
            <RadioPrimitive.Root
              value={field.value ?? ""}
              onValueChange={field.onChange}
              aria-labelledby="colour"
              aria-describedby={fieldState.error ? "colour-error" : undefined}
              className="flex flex-wrap gap-2"
            >
              {COURSE_COLOURS.map((c) => (
                <RadioPrimitive.Item
                  key={c}
                  value={c}
                  aria-label={COLOUR_LABEL[c]}
                  title={COLOUR_LABEL[c]}
                  className={`flex size-11 items-center justify-center rounded-full text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring data-[state=checked]:ring-2 data-[state=checked]:ring-foreground data-[state=checked]:ring-offset-2 ${COLOUR_BG[c]}`}
                >
                  <RadioPrimitive.Indicator>
                    <Check size={20} strokeWidth={2.5} aria-hidden="true" />
                  </RadioPrimitive.Indicator>
                </RadioPrimitive.Item>
              ))}
            </RadioPrimitive.Root>
            {fieldState.error && <FieldError id="colour-error" errors={[fieldState.error]} />}
          </FieldSet>
        )}
      />
      <div className="flex justify-end">
        <SaveButton pending={isSubmitting} className="max-md:w-full">
          {course ? "Save" : "Add Course"}
        </SaveButton>
      </div>
    </form>
  );
}
