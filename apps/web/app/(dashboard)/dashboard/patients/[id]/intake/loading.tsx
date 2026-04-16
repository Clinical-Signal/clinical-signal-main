import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function IntakeLoading() {
  return (
    <Page>
      <Skeleton className="mb-3 h-3 w-28" />
      <PageHeader title="Capture the baseline" />
      <div className="flex flex-col gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <section key={i} className="rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="flex flex-col gap-3 px-6 py-5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
