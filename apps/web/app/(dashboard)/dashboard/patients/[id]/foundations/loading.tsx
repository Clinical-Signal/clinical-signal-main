import { Page, PageHeader } from "@/components/ui/page";

export default function FoundationsLoading() {
  return (
    <Page>
      <div className="mb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-sunken" />
      </div>
      <PageHeader title="Foundational checklist" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg border border-line bg-surface-sunken"
          />
        ))}
      </div>
    </Page>
  );
}
