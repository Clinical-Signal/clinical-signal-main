import Link from "next/link";
import { ResetForm } from "./form";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Reset password</h2>
        <p className="mt-1 text-sm text-ink-subtle">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>
      <ResetForm />
      <p className="text-sm text-ink-muted">
        <Link
          className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
          href="/login"
        >
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
