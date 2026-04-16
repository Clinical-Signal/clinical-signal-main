import Link from "next/link";
import { LoginForm } from "./form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">Sign in</h2>
        <p className="mt-1 text-sm text-ink-subtle">
          Welcome back.
        </p>
      </div>
      <LoginForm next={searchParams.next ?? "/dashboard"} />
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-ink-muted">
          New practitioner?{" "}
          <Link
            className="text-accent underline-offset-2 hover:underline"
            href="/signup"
          >
            Create an account
          </Link>
        </p>
        <p className="text-ink-muted">
          <Link
            className="text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            href="/reset-password"
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}
