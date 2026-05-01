import { requireAuth } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui/page";
import { AuditLogViewer } from "./audit-log-viewer";
import { withTenant } from "@/lib/db";

interface PatientOption {
  id: string;
  name: string;
}

export default async function AuditLogPage() {
  const user = await requireAuth();

  // Fetch patient list for the filter dropdown
  const patients = await withTenant(user.tenantId, async (c) => {
    const { rows } = await c.query<PatientOption>(
      `SELECT id::text, name FROM patients ORDER BY name`,
    );
    return rows;
  });

  return (
    <Page>
      <PageHeader
        title="Audit log"
        description="All access and actions on patient records. Required for HIPAA compliance."
      />
      <AuditLogViewer patients={patients} />
    </Page>
  );
}
