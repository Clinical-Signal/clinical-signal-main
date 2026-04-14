import Link from "next/link";
import { ResetForm } from "./form";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Reset password</h2>
      <ResetForm />
      <p className="text-sm text-slate-600">
        <Link className="underline" href="/login">Back to sign in</Link>
      </p>
    </div>
  );
}
