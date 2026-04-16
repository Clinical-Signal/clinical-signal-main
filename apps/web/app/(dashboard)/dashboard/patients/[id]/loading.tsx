import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function PatientDetailLoading() {
  return (
    <Page>
      <Skeleton className="mb-3 h-3 w-24" />
      <PageHeader
        title={<Skeleton className="h-7 w-64" />}
        description={<Skeleton className="mt-2 h-3 w-48" />}
      />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
          >
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32" />
            <div className="mt-auto flex items-center gap-3">
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}
