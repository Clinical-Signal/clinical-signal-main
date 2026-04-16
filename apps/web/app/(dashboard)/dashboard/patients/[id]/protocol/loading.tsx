import { Page, PageHeader } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProtocolIndexLoading() {
  return (
    <Page>
      <Skeleton className="mb-3 h-3 w-32" />
      <PageHeader title="Protocol" />
      <Skeleton className="h-10 w-44" />
    </Page>
  );
}
