import { requireAuth } from "@/lib/auth";
import { getPreferences, CATEGORY_LABELS } from "@/lib/preferences";
import { Page, PageHeader } from "@/components/ui/page";
import { PreferencesForm } from "./preferences-form";

export default async function SettingsPage() {
  const user = await requireAuth();
  const preferences = await getPreferences(user.tenantId, user.practitionerId);

  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Configure your protocol playbook. These rules guide how the AI generates protocols, client documents, call decks, and email drafts."
      />

      <PreferencesForm
        initialPreferences={preferences.map((p) => ({
          id: p.id,
          category: p.category,
          categoryLabel: CATEGORY_LABELS[p.category],
          ruleText: p.ruleText,
          label: p.label,
          active: p.active,
        }))}
      />
    </Page>
  );
}
