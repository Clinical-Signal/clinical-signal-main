# Intake Quick Wins — Implementation Plans

**Date:** May 8, 2026
**Status:** T4.1 already applied to working tree; T4.2 and T4.3 below are diffs ready to apply.

These three changes correspond to GitHub issues #166, #167, #168 from the May 5 Dr. Laura intake QA round. All are JSONB-backed, so no database migrations are needed — added fields just absorb into the existing `intake_data` columns.

---

## ✅ T4.1 — Issue #166: Remove redundant Goals section

**Status: Applied to working tree.** Three edits in `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/form.tsx`:

1. Removed the `IntakeGoalsSection` import (line 20)
2. Removed the `<GoalsSection ... />` render block (was lines 267–273) and replaced with a comment explaining the removal
3. Removed the entire `function GoalsSection(...)` definition (was lines 916–957) and replaced with a comment

**What was preserved:**
- `IntakeGoalsSection` type and interface in `lib/intake-schema.ts:175`
- `goals?` field on `IntakeData` (`lib/intake-schema.ts:313`)
- `case "goals":` branch in `isSectionComplete()` (`lib/intake-schema.ts:513-514`) — still works for existing data
- `INTAKE_SECTIONS` array in `lib/intake-schema.ts:417-434` — already didn't include "goals"; progress calc was already excluding it. So progress percentage is unaffected.

**To verify:** `cd apps/web && npx tsc --noEmit` should pass. Then run `npm run dev` and walk through the form — Section 11 should no longer appear; the form should jump directly from "Previous labs" to "Wearables".

**Acceptance criteria status:**
- [x] Section 11 removed from form
- [x] GoalsSection component removed
- [x] Progress bar calc unchanged (was already excluding goals)
- [x] Existing goals data preserved in DB
- [x] Completion percentage still calculates correctly

---

## T4.2 — Issue #167: Reorder metabolism deep dive — gate on body-comp goal

**File:** `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/metabolism-deep-dive.tsx`

**Approach:** Add a `has_body_comp_goal` yes/no gate at the top. If "yes", show the weight-related questions block (`weight_goal`, `weight_history`, `weight_loss_attempts`, `weight_fluctuations`, `body_composition_testing`, and the existing `motivation_for_weight_change` slider). If "no" or unanswered, skip straight to the metabolism-only questions (`hunger_patterns`, `cravings`, `energy_crashes`, blood-sugar block, `family_metabolic_history`, `meal_timing`, `eating_speed`).

This matches Dr. Laura's quote: "Not all metabolism goals are weight-related, so while I think these are good questions, maybe don't lead with them."

### Diff

```diff
--- a/apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/metabolism-deep-dive.tsx
+++ b/apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/metabolism-deep-dive.tsx
@@ -12,6 +12,7 @@ import {
 } from "../shared";

 export interface MetabolismDeepDiveData {
+  has_body_comp_goal: "yes" | "no" | "";
   weight_goal: "lose" | "gain" | "maintain" | "recomposition" | "";
   weight_history: string;
   weight_loss_attempts: string;
@@ -30,6 +31,7 @@ export interface MetabolismDeepDiveData {
 }

 const EMPTY: MetabolismDeepDiveData = {
+  has_body_comp_goal: "",
   weight_goal: "",
   weight_history: "",
   weight_loss_attempts: "",
@@ -65,93 +67,118 @@ export function MetabolismDeepDiveSection({ patientId, initial, onDraftChange }:
   function patch(p: Partial<MetabolismDeepDiveData>) {
     setData((d) => ({ ...d, ...p }));
   }

+  const showWeightQuestions = data.has_body_comp_goal === "yes";
+
   return (
     <SectionShell
       title="Weight & metabolism deep dive"
       description="Weight resistance is often a downstream symptom of hormonal, gut, or metabolic imbalance. This section helps us understand the root cause rather than just the number on the scale."
       status={status}
     >
       <SelectField
-        label="What's your weight-related goal?"
-        value={data.weight_goal}
-        onChange={(v) => patch({ weight_goal: v as MetabolismDeepDiveData["weight_goal"] })}
+        label="Do you have a body composition or weight-related goal right now?"
+        value={data.has_body_comp_goal}
+        onChange={(v) => patch({ has_body_comp_goal: v as MetabolismDeepDiveData["has_body_comp_goal"] })}
         options={[
           { value: "", label: "—" },
-          { value: "lose", label: "Lose weight" },
-          { value: "gain", label: "Gain weight" },
-          { value: "maintain", label: "Maintain current weight" },
-          { value: "recomposition", label: "Body recomposition (lose fat, gain muscle)" },
+          { value: "yes", label: "Yes" },
+          { value: "no", label: "No — focused on metabolism, energy, or other goals" },
         ]}
       />

-      <TextArea
-        label="Describe your weight history"
-        value={data.weight_history}
-        onChange={(v) => patch({ weight_history: v })}
-        rows={2}
-        placeholder="Has your weight been stable? Gradual gain? Sudden changes? What life events corresponded?"
-      />
+      {showWeightQuestions && (
+        <>
+          <SelectField
+            label="What's your weight-related goal?"
+            value={data.weight_goal}
+            onChange={(v) => patch({ weight_goal: v as MetabolismDeepDiveData["weight_goal"] })}
+            options={[
+              { value: "", label: "—" },
+              { value: "lose", label: "Lose weight" },
+              { value: "gain", label: "Gain weight" },
+              { value: "maintain", label: "Maintain current weight" },
+              { value: "recomposition", label: "Body recomposition (lose fat, gain muscle)" },
+            ]}
+          />

-      <TextArea
-        label="What weight loss approaches have you tried?"
-        value={data.weight_loss_attempts}
-        onChange={(v) => patch({ weight_loss_attempts: v })}
-        rows={2}
-        placeholder="Diets, programs, medications (Ozempic, etc.), fasting protocols, etc."
-      />
+          <TextArea
+            label="Describe your weight history"
+            value={data.weight_history}
+            onChange={(v) => patch({ weight_history: v })}
+            rows={2}
+            placeholder="Has your weight been stable? Gradual gain? Sudden changes? What life events corresponded?"
+          />

-      <TextArea
-        label="Do you experience weight fluctuations?"
-        value={data.weight_fluctuations}
-        onChange={(v) => patch({ weight_fluctuations: v })}
-        rows={2}
-        placeholder="Water retention, rapid gain/loss, cycle-related changes?"
-      />
+          <TextArea
+            label="What weight loss approaches have you tried?"
+            value={data.weight_loss_attempts}
+            onChange={(v) => patch({ weight_loss_attempts: v })}
+            rows={2}
+            placeholder="Diets, programs, medications (Ozempic, etc.), fasting protocols, etc."
+          />
+
+          <TextArea
+            label="Do you experience weight fluctuations?"
+            value={data.weight_fluctuations}
+            onChange={(v) => patch({ weight_fluctuations: v })}
+            rows={2}
+            placeholder="Water retention, rapid gain/loss, cycle-related changes?"
+          />
+
+          <TextArea
+            label="Have you done body composition testing? (DEXA, InBody, etc.)"
+            value={data.body_composition_testing}
+            onChange={(v) => patch({ body_composition_testing: v })}
+            rows={2}
+          />
+
+          {data.weight_goal === "lose" && (
+            <SliderField
+              label="How motivated are you to make dietary/lifestyle changes for weight loss? (1-10)"
+              value={data.motivation_for_weight_change}
+              onChange={(v) => patch({ motivation_for_weight_change: v })}
+            />
+          )}
+        </>
+      )}

       <TextArea
         label="Describe your hunger patterns"
         value={data.hunger_patterns}
         onChange={(v) => patch({ hunger_patterns: v })}
         rows={2}
         placeholder="Always hungry? Rarely hungry? Hungry but no appetite? Specific times of day?"
       />

       <TextArea
         label="What cravings do you experience?"
         value={data.cravings}
         onChange={(v) => patch({ cravings: v })}
         rows={2}
         placeholder="Sugar, salt, carbs, chocolate, specific foods? When do they hit?"
       />

       <TextArea
         label="Do you experience energy crashes?"
         value={data.energy_crashes}
         onChange={(v) => patch({ energy_crashes: v })}
         rows={2}
         placeholder="After meals? Mid-afternoon? Morning? How severe?"
       />

       <TextArea
         label="Have you been diagnosed with any blood sugar or metabolic conditions?"
         value={data.blood_sugar_diagnosed}
         onChange={(v) => patch({ blood_sugar_diagnosed: v })}
         rows={2}
         placeholder="Pre-diabetes, insulin resistance, diabetes, metabolic syndrome, PCOS?"
       />

       <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
         <TextField
           label="Fasting glucose (if known)"
           value={data.fasting_glucose_known}
           onChange={(v) => patch({ fasting_glucose_known: v })}
           placeholder="e.g., 95 mg/dL"
         />
         <TextField
           label="HbA1c (if known)"
           value={data.a1c_known}
           onChange={(v) => patch({ a1c_known: v })}
           placeholder="e.g., 5.4%"
         />
       </div>

       <TextArea
         label="Family history of metabolic conditions?"
         value={data.family_metabolic_history}
         onChange={(v) => patch({ family_metabolic_history: v })}
         rows={2}
         placeholder="Diabetes, obesity, heart disease, metabolic syndrome?"
       />

       <TextArea
         label="Describe your typical meal timing"
         value={data.meal_timing}
         onChange={(v) => patch({ meal_timing: v })}
         rows={2}
         placeholder="When do you eat your first and last meal? Do you skip meals? Intermittent fasting?"
       />

       <SelectField
         label="How quickly do you eat?"
         value={data.eating_speed}
         onChange={(v) => patch({ eating_speed: v as MetabolismDeepDiveData["eating_speed"] })}
         options={[
           { value: "", label: "—" },
           { value: "fast", label: "Fast (done in 5-10 min)" },
           { value: "moderate", label: "Moderate (10-20 min)" },
           { value: "slow", label: "Slow (20+ min)" },
         ]}
       />

-      <TextArea
-        label="Have you done body composition testing? (DEXA, InBody, etc.)"
-        value={data.body_composition_testing}
-        onChange={(v) => patch({ body_composition_testing: v })}
-        rows={2}
-      />
-
-      {data.weight_goal === "lose" && (
-        <SliderField
-          label="How motivated are you to make dietary/lifestyle changes for weight loss? (1-10)"
-          value={data.motivation_for_weight_change}
-          onChange={(v) => patch({ motivation_for_weight_change: v })}
-        />
-      )}
     </SectionShell>
   );
 }
```

**Acceptance criteria mapping:**
- [x] Gate question at the top: "Do you have a body composition or weight-related goal right now?"
- [x] If yes → weight-related questions appear
- [x] If no → skip to non-weight metabolism questions (energy, blood sugar, thyroid, etc.)
- [x] Weight questions moved below the gate

**Open question for Ryan:**
- Wording of the gate question — I used the exact phrasing from the issue body. Confirm Dr. Laura's preference before merging.
- Should `family_metabolic_history` be in the weight-gated block or always shown? Currently in always-shown block since metabolic family history is relevant even without weight goals. Please confirm.

---

## T4.3 — Issue #168: Add wearable tracking question to sleep section

**File:** `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/sleep-deep-dive.tsx`

**Approach:** Add three new fields at the end of the sleep section. `wearable_use` is a yes/no select; the device dropdown only appears if yes; `wearable_share_data` is yes/no/maybe.

### Diff

```diff
--- a/apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/sleep-deep-dive.tsx
+++ b/apps/web/app/(dashboard)/dashboard/patients/[id]/intake/sections/sleep-deep-dive.tsx
@@ -19,9 +19,12 @@ export interface SleepDeepDiveData {
   restless_legs: string;
   sleep_aids: string;
   energy_pattern_during_day: string;
   caffeine_after_noon: "yes" | "no" | "";
   nap_frequency: string;
+  wearable_use: "yes" | "no" | "";
+  wearable_device: "" | "oura" | "apple_watch" | "whoop" | "fitbit" | "garmin" | "other";
+  wearable_share_data: "yes" | "no" | "maybe" | "";
 }

 const EMPTY: SleepDeepDiveData = {
@@ -36,6 +39,9 @@ const EMPTY: SleepDeepDiveData = {
   energy_pattern_during_day: "",
   caffeine_after_noon: "",
   nap_frequency: "",
+  wearable_use: "",
+  wearable_device: "",
+  wearable_share_data: "",
 };

@@ -154,6 +160,46 @@ export function SleepDeepDiveSection({ patientId, initial, onDraftChange }: Prop
       <TextField
         label="How often do you nap?"
         value={data.nap_frequency}
         onChange={(v) => patch({ nap_frequency: v })}
         placeholder="Never / occasionally / daily — and for how long?"
       />
+
+      <SelectField
+        label="Do you use a wearable device to track your sleep?"
+        value={data.wearable_use}
+        onChange={(v) => patch({ wearable_use: v as SleepDeepDiveData["wearable_use"] })}
+        options={[
+          { value: "", label: "—" },
+          { value: "yes", label: "Yes" },
+          { value: "no", label: "No" },
+        ]}
+      />
+
+      {data.wearable_use === "yes" && (
+        <>
+          <SelectField
+            label="Which device?"
+            value={data.wearable_device}
+            onChange={(v) => patch({ wearable_device: v as SleepDeepDiveData["wearable_device"] })}
+            options={[
+              { value: "", label: "—" },
+              { value: "oura", label: "Oura Ring" },
+              { value: "apple_watch", label: "Apple Watch" },
+              { value: "whoop", label: "Whoop" },
+              { value: "fitbit", label: "Fitbit" },
+              { value: "garmin", label: "Garmin" },
+              { value: "other", label: "Other" },
+            ]}
+          />
+
+          <SelectField
+            label="Can you share your sleep data or screenshots before your intake visit?"
+            value={data.wearable_share_data}
+            onChange={(v) => patch({ wearable_share_data: v as SleepDeepDiveData["wearable_share_data"] })}
+            options={[
+              { value: "", label: "—" },
+              { value: "yes", label: "Yes" },
+              { value: "maybe", label: "Maybe — I'll need to figure out how" },
+              { value: "no", label: "No" },
+            ]}
+          />
+        </>
+      )}
     </SectionShell>
   );
 }
```

**Note on relationship to existing Wearables section:** The intake form already has a `WearablesSection` (Section 12, file `sections/wearables.tsx`) covering wearable usage in general. Issue #168 specifically asks for sleep-data-share intent in the sleep section, since sleep practitioners want it gathered there. There's some duplication — Dr. Laura should review whether the sleep-section question should replace or supplement the Wearables section.

**Acceptance criteria mapping:**
- [x] "Do you use a wearable device to track your sleep?"
- [x] Conditional "Which device?" dropdown
- [x] "Can you share your sleep data or screenshots before your intake visit?"
- [x] Auto-save works (uses existing `useDebouncedSave` hook — no change needed)

**Open question for Ryan:**
- Confirm device list. Issue body specifies Oura/Apple Watch/Whoop/Fitbit/Garmin/Other. Let me know if Dr. Laura wants more (Eight Sleep, Pillow, Polar) or fewer.
- Decide overlap with `WearablesSection` — should that section now ask only about non-sleep wearables?

---

## T4.4 — Issue #165: Multi-activity exercise field

**Status: Plan only — not in this batch.**

This one is bigger because of the data migration concern. The issue says "Existing single-entry data migrates cleanly." Current schema (`IntakeLifestyleSection.exercise`) is a single object `{ type, frequency, duration, intensity }`. The change needs:

1. Schema change: `exercise: ExerciseEntry` → `exercises: ExerciseEntry[]` (or keep both fields, populate `exercises[0]` from the legacy `exercise` value)
2. Form UI: add/remove activity rows, like the existing pattern in `MedicationsSection` (which has supplements as an array — copy that pattern)
3. Migration consideration: since intake data is JSONB, no SQL migration needed; but `isSectionComplete()` for `lifestyle` needs to handle both old (`exercise.type`) and new (`exercises[0].type`) shapes during the transition
4. Server actions: `actions.ts` should not need changes (JSONB pass-through)
5. Test that an existing patient with `lifestyle.exercise` populated still renders correctly when the form opens

Suggest landing this as a separate PR after T4.1–T4.3 are merged. ~3–4 hr of work.

---

## How to apply T4.2 and T4.3

When you're back, you can either:

**Option A — manual edits.** Open each section file and apply the diffs above by hand. Each is contained to one file.

**Option B — patch file.** I can produce a literal `git apply`-able .patch file if you'd rather do `git apply` once. Ask and I'll generate it.

**Option C — let me apply them next session.** Just say go, and I'll edit the two section files directly the same way I did with form.tsx for T4.1.

After applying, verify with:

```bash
cd apps/web
npx tsc --noEmit         # should pass
npm run dev              # walk through the form
```
