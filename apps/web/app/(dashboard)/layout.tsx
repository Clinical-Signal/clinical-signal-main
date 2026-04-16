import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-3 sm:px-8">
          <Link
            href="/dashboard"
            className="font-serif text-lg tracking-tight text-ink hover:text-accent"
          >
            Clinical Signal
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <div className="hidden text-right sm:block">
              <div className="text-ink">{user.name}</div>
              <div className="text-xs text-ink-subtle capitalize">{user.role}</div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
