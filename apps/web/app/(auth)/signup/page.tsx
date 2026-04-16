import Link from "next/link";
import { SignupForm } from "./form";

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Create your account</h2>
        <p className="mt-1 text-sm text-ink-subtle">
          For functional health practitioners managing 5–15 active clients.
        </p>
      </div>
      <SignupForm />
      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link
          className="text-accent underline-offset-2 hover:underline"
          href="/login"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
