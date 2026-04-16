import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <Page>
      <PageHeader title="Patients" />
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="border-b border-line bg-surface-sunken/50 px-5 py-3">
          <Skeleton className="h-3 w-32" />
        </div>
        <ul className="divide-y divide-line">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between px-5 py-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
