# Handoff prompt for Claude Code — Issue #166 finalization (Goals section removal)

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Verify, branch, PR, merge the Issue #166 (intake Goals section removal) edits already applied locally

Per `docs/MVP-PRIORITIZATION-2026-05-08.md` rev 6 IF.3: Cowork applied the Goals-section removal edits to `apps/web/app/(dashboard)/dashboard/patients/[id]/intake/form.tsx` directly. The diff is sitting in the working tree, not yet committed. Three small steps to ship:

## Implementation

1. Confirm the working tree changes are still there:

```bash
git diff apps/web/app/(dashboard)/dashboard/patients/[id]/intake/form.tsx
```

You should see:
- Removal of the `IntakeGoalsSection` type import (around line 20)
- Removal of the `<GoalsSection ... />` render block (was around lines 267-273) replaced with an explanatory comment
- Removal of the entire `function GoalsSection(...)` definition (was around lines 916-957) replaced with an explanatory comment

If the diff is missing or doesn't match, stop and report — something else may have touched the file.

2. Verify the change compiles cleanly:

```bash
cd apps/web
npx tsc --noEmit
```

Should pass with no errors. If it complains about an unused import or an unreferenced type, the cleanup isn't quite right — check for stragglers.

3. Branch, commit, push, PR:

```bash
git checkout -b fix/166-remove-redundant-goals-section
git add apps/web/app/(dashboard)/dashboard/patients/[id]/intake/form.tsx
git commit -m "Remove redundant Goals section from intake (closes #166)

Per Dr. Laura QA May 5, 2026: the Goals section overlapped substantially with
'Why you're here' (top three goals, 6-month vision, motivation). Removing the
duplication reduces patient intake fatigue without losing data.

What changes:
- Section 11 (Goals) no longer renders in the intake form
- IntakeGoalsSection import removed from form.tsx
- GoalsSection function removed from form.tsx

What is preserved:
- IntakeGoalsSection type stays in lib/intake-schema.ts (back-compat)
- goals?: IntakeGoalsSection field stays on IntakeData (back-compat)
- isSectionComplete() still handles the 'goals' case (existing data)
- INTAKE_SECTIONS array already excluded 'goals' — progress calc unchanged"
git push origin fix/166-remove-redundant-goals-section
gh pr create --title "Remove redundant Goals section from intake (#166)" \
             --body "Closes #166. Per investigation in CLAUDE.md and Dr. Laura QA May 5. Working-tree edits originally applied by Cowork in the May 10 session; this PR finalizes them.

## What changed
- Removed Section 11 (Goals) render block in intake form
- Removed IntakeGoalsSection import and GoalsSection function definition
- Both replaced with explanatory comments referencing #166

## Preserved for back-compat
- IntakeGoalsSection type still exported from lib/intake-schema.ts
- goals?: field still on IntakeData
- Existing patients with submitted goals data: still in DB, just no longer collected via this form
- INTAKE_SECTIONS array already excluded 'goals' — progress percentage unchanged

## Verification
- npx tsc --noEmit: passes
- Manual walk-through: form jumps from 'Previous labs' (Section 10) directly to 'Wearables' (Section 12), no Section 11
" \
             --base main
```

4. Mark ready for review (it'll be a regular PR not draft if `gh pr create` is used without `--draft`). Merge when CI passes.

## Hard constraints

- **Don't change anything else in `form.tsx`.** This PR is exactly the scope of the existing working-tree edits — nothing more.
- **Keep the IntakeGoalsSection TYPE in `lib/intake-schema.ts`.** Existing patients have `goals` data in the DB. If you remove the type, deserialization breaks for those records. The form just stops collecting new data; old data stays intact and accessible.

## Verification before merge

Beyond the `tsc --noEmit` and the visual walk-through, also:

```bash
# Confirm no other files reference GoalsSection (the removed function)
grep -rn "GoalsSection" apps/web/

# Should only show form.tsx (the comment) and intake-schema.ts (the type, still exported)
```

## Deliverable

- Branch `fix/166-remove-redundant-goals-section` pushed to origin
- PR opened against main, ready for review
- Issue #166 will auto-close on merge

When the PR is open, paste the URL.
