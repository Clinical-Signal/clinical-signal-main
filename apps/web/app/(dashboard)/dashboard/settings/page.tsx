import { requireAuth } from "@/lib/auth";
import { getPreferences, CATEGORY_LABELS } from "@/lib/preferences";
import { getPendingSuggestions } from "@/lib/pattern-recognition";
import { Page, PageHeader } from "@/components/ui/page";
import { PreferencesForm } from "./preferences-form";
import { SuggestedPreferences } from "./suggested-preferences";

export default async function SettingsPage() {
  const user = await requireAuth();
  const preferences = await getPreferences(user.tenantId, user.practitionerId);

  let suggestions: Awaited<ReturnType<typeof getPendingSuggestions>> = [];
  try {
    suggestions = await getPendingSuggestions(user.tenantId, user.practitionerId);
  } catch {
    // Non-fatal — table may not exist yet if migration hasn't run
  }

  return (
    <Page>
      <PageHeader
        title="Settings"
        description="Configure your protocol playbook. These rules guide how the AI generates protocols, client documents, call decks, and email drafts."
      />

      {suggestions.length > 0 && (
        <SuggestedPreferences
          initialSuggestions={suggestions.map((s) => ({
            id: s.id,
            category: s.category,
            suggestedRule: s.suggestedRule,
            label: s.label,
            reasoning: s.reasoning,
          }))}
        />
      )}

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
