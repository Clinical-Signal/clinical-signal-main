import { requireAuth } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <h1 className="text-lg font-semibold">Clinical Signal</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600">{user.name} · {user.role}</span>
          <LogoutButton />
        </div>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
