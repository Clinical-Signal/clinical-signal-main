"use server";

import { redirect } from "next/navigation";
import { signup } from "@/lib/auth";

export async function signupAction(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  // Only forward practiceName when it has real content; an empty or
  // whitespace-only field becomes `undefined` so signup()'s server-side
  // fallback ("{name}'s practice") fires consistently regardless of
  // whether the field was hidden, untouched, or trimmed-empty.
  const rawPractice = String(formData.get("practiceName") ?? "").trim();
  const practiceName = rawPractice.length > 0 ? rawPractice : undefined;

  const result = await signup({ email, password, name, practiceName });
  if (!result.ok) return { error: result.error };
  redirect(result.redirectTo);
}
