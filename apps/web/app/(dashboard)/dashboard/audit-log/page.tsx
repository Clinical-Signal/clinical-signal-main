import { requireAuth } from "@/lib/auth";
import { Page, PageHeader } from "@/components/ui/page";
import { AuditLogViewer } from "./audit-log-viewer";
import { withTenantContext, phiKey } from "@cs/db";

interface PatientOption {
  id: string;
  name: string;
}

export default async function AuditLogPage() {
  const user = await requireAuth();

  // Fetch patient list for the filter dropdown
  const patients = await withTenantContext(user, async (c) => {
    const { rows } = await c.query<PatientOption>(
      `SELECT id::text, pgp_sym_decrypt(name_encrypted, $1)::text AS name FROM patients ORDER BY 2`,
      [phiKey()],
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
