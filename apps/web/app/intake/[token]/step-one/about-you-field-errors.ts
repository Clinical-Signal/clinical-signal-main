import { AboutYouSchema, type AboutYou } from "@/lib/intake/schemas/step-one.schema";

const FIELD_LABELS: Partial<Record<keyof AboutYou, string>> = {
  full_name: "Full name",
  date_of_birth: "Date of birth",
  sex_at_birth: "Sex assigned at birth",
};

export function aboutYouFieldErrors(value: AboutYou): Partial<Record<keyof AboutYou, string>> {
  const parsed = AboutYouSchema.safeParse(value);
  if (parsed.success) {
    return {};
  }

  const errors: Partial<Record<keyof AboutYou, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || key in errors) {
      continue;
    }
    const field = key as keyof AboutYou;
    const label = FIELD_LABELS[field] ?? field.replaceAll("_", " ");
    if (issue.code === "too_small") {
      errors[field] = `${label} is required.`;
    } else if (issue.code === "invalid_format" && field === "date_of_birth") {
      errors[field] = "Use a valid date (YYYY-MM-DD).";
    } else {
      errors[field] = issue.message;
    }
  }
  return errors;
}

export function isAboutYouValid(value: AboutYou): boolean {
  return AboutYouSchema.safeParse(value).success;
}
