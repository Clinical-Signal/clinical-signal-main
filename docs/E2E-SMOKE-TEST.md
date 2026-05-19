# End-to-end smoke test — reusable checklist

**Purpose:** verify that the full user-facing flow (login → patient → intake → labs → protocol → outputs) still works end-to-end after a meaningful change (merge batch, refactor, new feature). Catches regressions that per-PR verification misses, especially cross-PR interactions.

**When to run it:**
- After every merge batch (2+ PRs landing close together)
- After any refactor that touches `lib/analysis.ts`, `lib/llm.ts`, `lib/protocol-outputs.ts`, the analysis-engine, or any auth/session code
- After any database migration
- Before any production deploy
- When in doubt, run it — 20-30 minutes is cheap insurance

**Time:** 20-30 minutes if everything works. Add 30-60 minutes of debug time if something fails.

---

## Prerequisites

- [ ] Local dev environment running: `docker compose up -d` (Postgres, analysis-engine, web)
- [ ] Web app reachable at `http://localhost:3000`
- [ ] Logged out (start fresh)
- [ ] Have a known practitioner credential available (the dev seed creates `dev@example.com / devpassword12!` per `database/migrations/0003_seed_dev.sql`)
- [ ] Have at least one synthetic lab PDF ready to upload (check `database/seed/` or use any synthetic PDF you can attach)

---

## Test plan

### Step 1 — Authentication

- [ ] Navigate to `http://localhost:3000`
- [ ] If not redirected to login, click logout
- [ ] Log in with practitioner credentials
- [ ] **Verify:** redirect to `/dashboard`, no error toast, no console errors

**Failure modes to watch for:** session handling regressions, NextAuth misconfig, password hash mismatch.

### Step 2 — Patient creation

- [ ] From dashboard, click "New Patient" or navigate to `/dashboard/patients/new`
- [ ] Fill in required fields (name, DOB, email)
- [ ] Submit
- [ ] **Verify:** new patient appears in the patient list, redirects to that patient's detail page

**Failure modes:** PHI encryption issues, RLS policy errors, missing required fields validation.

### Step 3 — Intake form (specifically verify recent changes)

- [ ] Open the new patient's intake form (`/dashboard/patients/[id]/intake`)
- [ ] **Verify:** form loads without error, no missing sections, no console errors
- [ ] Walk through the section list. Confirm sections appear in this order:
  - About you
  - Why you're here
  - Current symptoms (MSQ + free-form)
  - Health history
  - Medications & supplements
  - Lifestyle
  - Hormones (required)
  - Conditional deep-dives (gut / immune / sleep / stress / skin / metabolism — only if symptoms trigger them)
  - Previous labs
  - Wearables  ← **This should follow Previous Labs directly. NO Goals section between them (per Issue #166 / PR #188).**
  - Anything else
- [ ] Fill in a few fields across multiple sections
- [ ] Wait 2-3 seconds for auto-save
- [ ] Refresh the page
- [ ] **Verify:** filled-in data persisted

**Failure modes specific to this batch:** if the Goals section is still rendering, PR #188 didn't merge cleanly. If any section is missing, the form.tsx changes broke something else.

### Step 4 — Lab upload

- [ ] Navigate to the patient's records page (`/dashboard/patients/[id]/records`)
- [ ] Upload a synthetic lab PDF
- [ ] **Verify:** upload succeeds without error, file appears in records list with status "processing" or "pending"
- [ ] Wait for extraction to complete (could take 30-60 seconds)
- [ ] Click into the record
- [ ] **Verify:** extracted lab values appear in the review table

**Failure modes:** S3/Vercel Blob upload failure, content-type validation issues, Python analysis-engine extraction failure.

### Step 5 — Submit intake + generate protocol

- [ ] Return to the intake form
- [ ] Submit the intake (advances patient to "labs pending" status)
- [ ] Navigate to the patient detail page
- [ ] Click "Generate protocol" (or whatever the trigger is on the patient hub)
- [ ] Watch the streaming output
- [ ] **Verify:**
  - Streaming response starts within 2-3 seconds
  - No error in the stream
  - Protocol JSON parses cleanly
  - Both `clinical_protocol` and `client_action_plan` sections present
  - Safety validation runs (look for `safetyValidation` in the response payload)
  - Truncation detection logs (if any) — look for warnings in the dev server console
- [ ] Open the generated protocol in the editor
- [ ] **Verify:** protocol renders without error, all sections visible

**Failure modes:** Anthropic API issues, prompt template loading (post-PR-#172 lib/prompts/*.md), JSON parse failures, missing sections.

### Step 6 — Approve protocol + verify derivative outputs

- [ ] Click "Approve" on the protocol
- [ ] Wait for derivative outputs to generate (client doc, call deck, email draft)
- [ ] **Verify:** all three derivative outputs appear in the outputs page

### Step 7 — Verify ownership check (regression check for PR #189)

This is the **highest-risk regression from the May 11 merge batch.** PR #189 added an ownership check to 3 routes (outputs / dialogue GET / export). We need to verify it doesn't 404 legitimate access.

- [ ] Click into each derivative output (client doc, call deck, email draft)
- [ ] **Verify:** all three load without 404 — legitimate access works correctly
- [ ] Try to load the protocol's export PDF
- [ ] **Verify:** PDF generates and downloads

**Optional defensive check** (proves the ownership check actually defends, not just that it doesn't break legitimate access):
- [ ] Create a SECOND patient
- [ ] Note the protocol ID from the FIRST patient
- [ ] In the URL bar, manually navigate to `/dashboard/patients/<patient-2-id>/protocol/<patient-1-protocol-id>/outputs`
- [ ] **Verify:** returns 404 (this is the #189 fix in action — ownership check rejects in-tenant URL manipulation)

### Step 8 — Audit log spot-check

- [ ] Navigate to `/dashboard/audit-log`
- [ ] **Verify:**
  - Audit log loads without error
  - Recent entries from this test session are present (login, patient_created, intake_submitted, protocol_generated, etc.)
  - No PHI leakage in the audit entries (names, dates, etc. should be encrypted or scoped properly)

### Step 9 — Knowledge orchestrator smoke test (regression check for PR #186)

The C.1.6 work refactored the post-load hook. Verify ingestion still works end-to-end with the new `post_ingest_finalize` wiring.

- [ ] In the analysis-engine container, run the ingestion script on a small JSONL:
  ```
  docker compose exec analysis-engine \
    python scripts/load_knowledge.py path/to/small-test.jsonl
  ```
  (Pick the smallest file in `database/seed/knowledge/`, or use `donna_transcript.jsonl` if it's small)
- [ ] **Verify:** load completes successfully, output shows:
  - `[load] done inserted=N skipped_duplicates=M`
  - `[finalize/autotag]` ran with non-zero count if there were untagged entries
  - `[finalize/confidence]` ran with rescore count
  - `[finalize/enqueue]` ran (counts can be zero if no qualifying entries)
- [ ] In Postgres, verify new entries (if any) have `domains`, `confidence_score`, and appropriate `review_status`:
  ```sql
  SELECT id, title, domains, confidence_score, review_status
    FROM clinical_knowledge
   WHERE created_at > now() - interval '5 minutes'
   LIMIT 5;
  ```

---

## Failure handling

If anything fails:

1. **Stop the test.** Don't try to push past a failure to "see if it works downstream."
2. **Capture the error.** Browser console, network tab response, dev-server logs, analysis-engine logs.
3. **Identify which PR likely caused it.** Recent merge batch was: PR #186 (C.1.6), #188 (Issue #166), #189 (A.3.1), #190 (A.3.6). Match the failure to the surface area each PR touched.
4. **If it's a clear regression:** revert the PR (or fix-forward if obvious), re-run the test from the failed step.
5. **If it's pre-existing:** file a bug issue with the repro steps, decide whether to block or proceed.

---

## Variations / extensions

For deeper test coverage when time permits:

- **Mobile viewport check:** repeat key steps with browser viewport set to iPhone size — confirms the intake form works on mobile (Dr. Laura's patients will use phones)
- **Multi-tenant isolation test:** create a second tenant + practitioner, verify they cannot see the first tenant's patients (RLS regression check)
- **Long protocol test:** generate a protocol against a complex synthetic patient (multi-system, many labs, long history) to verify truncation detection (B.2) and chunking (B.3) work at scale
- **Knowledge orchestrator coverage test:** verify the protocol's clinical reasoning section references entries from the knowledge base when relevant (proves the searchKnowledgeBase / formatKbContext pipeline is alive)

---

## When to update this doc

- After any new feature ships that changes the user-facing flow (e.g., when Layer D ships, add a step for practitioner upload + verification that protocols use Layer D content)
- After any new API endpoint that needs ownership checks
- When a new failure mode is discovered in the wild that this test should have caught
