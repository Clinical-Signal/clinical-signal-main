import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecordsLoading() {
  return (
    <Page>
      <Skeleton className="mb-3 h-3 w-32" />
      <PageHeader title="Records" />
      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-line bg-surface">
          <div className="border-b border-dashed border-line-strong bg-surface-sunken/30 px-6 py-10">
            <Skeleton className="mx-auto h-4 w-80" />
          </div>
          <div className="px-5 py-4">
            <Skeleton className="h-8 w-36" />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-line px-5 py-3 last:border-0"
            >
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
