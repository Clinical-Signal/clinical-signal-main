import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProtocolViewLoading() {
  return (
    <Page>
      <Skeleton className="mb-3 h-3 w-24" />
      <PageHeader
        title={<Skeleton className="h-7 w-96" />}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {["surface", "sunken"].map((t) => (
          <article
            key={t}
            className={`rounded-xl border border-line p-6 ${
              t === "surface" ? "bg-surface" : "bg-surface-sunken/40"
            }`}
          >
            <div className="mb-4 border-b border-line pb-3">
              <Skeleton className="h-4 w-56" />
              <Skeleton className="mt-2 h-3 w-72" />
            </div>
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Page>
  );
}
