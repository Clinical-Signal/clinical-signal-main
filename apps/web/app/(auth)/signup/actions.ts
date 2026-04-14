"use server";

import { redirect } from "next/navigation";
import { signup } from "@/lib/auth";

export async function signupAction(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "");

  const result = await signup({ email, password, name });
  if (!result.ok) return { error: result.error };
  redirect("/dashboard");
}
