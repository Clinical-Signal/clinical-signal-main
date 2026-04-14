import Link from "next/link";
import { SignupForm } from "./form";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Create practitioner account</h2>
      <SignupForm />
      <p className="text-sm text-slate-600">
        Already have an account? <Link className="underline" href="/login">Sign in</Link>
      </p>
    </div>
  );
}
