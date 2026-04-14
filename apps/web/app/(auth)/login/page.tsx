import Link from "next/link";
import { LoginForm } from "./form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Sign in</h2>
      <LoginForm next={searchParams.next ?? "/dashboard"} />
      <p className="text-sm text-slate-600">
        New practitioner? <Link className="underline" href="/signup">Create an account</Link>
      </p>
      <p className="text-sm text-slate-600">
        <Link className="underline" href="/reset-password">Forgot password?</Link>
      </p>
    </div>
  );
}
