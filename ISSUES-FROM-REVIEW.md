# GitHub Issues from Codebase Review (April 30, 2026)

Create these as GitHub issues. Parent issues are **Epics**; sub-items underneath are individual issues that reference the epic.

---

## Epic 1: Security — Before Launch
> These MUST be fixed before any real patient data enters the system.

### Issue #1.1 — [CRITICAL] Fix RLS policy GUC variable mismatch
**Labels:** `security`, `critical`, `before-launch`
Migration 0011 (intake_documents) uses `app.tenant_id` in RLS policies, but `withTenant()` sets `app.current_tenant_id`. This mismatch may allow cross-tenant data access. Audit every migration file for correct GUC name. Add integration test for cross-tenant access denial.
**Effort:** 1 hour

### Issue #1.2 — [CRITICAL] Enable SSL certificate validation on database connections
**Labels:** `security`, `critical`, `before-launch`
`lib/db.ts` sets `rejectUnauthorized: false`, disabling SSL cert validation. This allows MITM attacks on the database connection carrying PHI. Set `rejectUnauthorized: true` and configure the Railway CA certificate.
**Effort:** 30 min

### Issue #1.3 — [HIGH] Sanitize error messages across all API routes
**Labels:** `security`, `high`, `before-launch`
9 of 10 API routes return `err.message` directly to the client, potentially exposing DB schema, file paths, and internal state. Create a centralized error handler that logs full errors server-side and returns generic error codes to clients.
**Effort:** 2-3 hours

### Issue #1.4 — [HIGH] Add content-type validation for file uploads
**Labels:** `security`, `high`, `before-launch`
File upload validation checks extension only, not actual file content (magic bytes). Use the `file-type` npm package to detect actual content type and reject mismatches.
**Effort:** 1-2 hours

### Issue #1.5 — [HIGH] Add authorization check on protocol outputs route
**Labels:** `security`, `high`, `before-launch`
Protocol outputs route verifies patient belongs to tenant but doesn't verify the protocolId belongs to that patient. Add explicit check: `SELECT 1 FROM protocols WHERE id = $1 AND patient_id = $2`.
**Effort:** 30 min

---

## Epic 2: AI Output Quality
> The core value prop. These directly affect whether practitioners trust and adopt the platform.

### Issue #2.1 — [HIGH] Add document source attribution to AI prompts
**Labels:** `ai-quality`, `high`
When documents are fed to analysis prompts, they're labeled "Document 1", "Document 2" with no indication of type. The AI can't distinguish a practitioner note (highest authority) from an old PDF upload. Tag each document with its type: `[Transcript]`, `[Lab PDF]`, `[Practitioner Note]`, `[Intake Document]`. This lets the AI weight sources correctly per the existing transcript-authority instruction.
**File:** `lib/analysis.ts` — `formatTimelineForPrompt()` and prep brief route
**Effort:** 1-2 hours

### Issue #2.2 — [HIGH] Add post-generation safety validation pass
**Labels:** `ai-quality`, `high`, `safety`
After protocol generation, run a focused validation prompt that cross-checks recommended supplements against the patient's safety flags (medications, allergies, pregnancy status). Display conflicts as warnings in the protocol editor. Currently, the protocol prompt instructs the AI to check interactions, but there's no verification that it actually did.
**File:** `lib/analysis.ts` — new `validateProtocolSafety()` function
**Effort:** 4-6 hours

### Issue #2.3 — [HIGH] Detect and handle output truncation explicitly
**Labels:** `ai-quality`, `high`, `reliability`
Protocol generation at 64K tokens can truncate, and `salvageJson()` silently closes open brackets — potentially dropping entire supplement lists or client action plan layers. Instead: detect truncation, flag it in metadata, show a warning to the practitioner ("Protocol was too large and may be incomplete — consider regenerating"), and log which sections are present vs expected.
**File:** `lib/analysis.ts` — `runProtocolGeneration()`, `salvageJson()`
**Effort:** 2-3 hours

### Issue #2.4 — [MEDIUM] Smarter document text handling (replace naive 8K truncation)
**Labels:** `ai-quality`, `medium`
Documents are truncated at 8,000 chars (first 8K). For lengthy lab reports, critical data at the end is lost. Options: (a) extract key sections (abnormal values, flagged results) instead of head-truncating, (b) two-pass: summarize each document first then use summaries, (c) increase cap with extended thinking.
**File:** `lib/analysis.ts` line 704, prep brief route line 120
**Effort:** 4-6 hours

### Issue #2.5 — [MEDIUM] Add prompt versioning and tracking system
**Labels:** `ai-quality`, `medium`, `infrastructure`
Prompts are inline constants in `lib/analysis.ts`. When prompt wording changes, there's no way to trace which version generated a given protocol. Move prompts to versioned files or use content hashing. Store the prompt version/hash in protocol metadata so you can correlate output quality with prompt changes.
**File:** `lib/analysis.ts`, protocol and analysis DB writes
**Effort:** 3-4 hours

### Issue #2.6 — [MEDIUM] Add explicit drug-interaction checklist to prep brief prompt
**Labels:** `ai-quality`, `medium`, `safety`
The protocol generation prompt has a detailed list of critical drug-supplement interactions (Warfarin + fish oil, SSRIs + 5-HTP, etc.) but the prep brief prompt just says "flag any potential interactions." Add the same explicit checklist to the prep brief so practitioners get interaction warnings at the earliest touchpoint.
**File:** `lib/analysis.ts` — `PREP_BRIEF_PROMPT`
**Effort:** 1 hour

### Issue #2.7 — [MEDIUM] Define explicit red-flag thresholds
**Labels:** `ai-quality`, `medium`, `safety`
The prep brief prompt lists example red flags (chest pain, sudden weight loss, blood in stool) but doesn't define what qualifies. Add a structured list of conditions requiring conventional referral: vital sign thresholds, lab value critical ranges, symptom combinations. This prevents the AI from under-flagging borderline cases.
**File:** `lib/analysis.ts` — `PREP_BRIEF_PROMPT`
**Effort:** 1-2 hours

### Issue #2.8 — [MEDIUM] Enforce specific expected outcomes in client action plan layers
**Labels:** `ai-quality`, `medium`
The protocol prompt says layers "must have expected outcomes" but doesn't enforce specificity. Outcomes like "feel better" don't help patients self-assess. Add output validation or prompt guidance requiring SMART outcomes: "sleep through the night most nights" not "improved sleep."
**File:** `lib/analysis.ts` — `PROTOCOL_GENERATION_V1`
**Effort:** 1 hour

### Issue #2.9 — [LOW] Add extraction quality validation for uploaded documents
**Labels:** `ai-quality`, `low`
`insertDocument()` accepts extracted text without quality checks. Bad OCR, corrupted transcripts, or empty extractions are stored and fed to clinical analysis silently. Add a heuristic quality check (minimum length, character distribution, language detection) and flag low-quality extractions for manual review.
**File:** `lib/intake-documents.ts`
**Effort:** 2-3 hours

### Issue #2.10 — [LOW] Improve document chunking for structured data
**Labels:** `ai-quality`, `low`
`chunkText()` splits on sentence boundaries with rough token estimation (length/4). This breaks structured data like lab tables mid-row, losing context. Add awareness of table/structured data boundaries.
**File:** `lib/intake-documents.ts` — `chunkText()`
**Effort:** 3-4 hours

---

## Epic 3: Data Integrity
> Prevent orphaned records, improve query performance, protect credentials.

### Issue #3.1 — [HIGH] Add foreign key constraints to migrations
**Labels:** `data-integrity`, `high`
`intake_documents` and `protocol_outputs` lack FK constraints. Add FKs with appropriate CASCADE/RESTRICT behavior.
**Effort:** 1-2 hours

### Issue #3.2 — [MEDIUM] Add missing database indexes
**Labels:** `data-integrity`, `medium`
Add composite indexes for common query patterns: `(tenant_id, patient_id, created_at)` on intake_documents, partial index on `metadata->>'type'` for prep_brief lookups.
**Effort:** 1 hour

### Issue #3.3 — [MEDIUM] Store S3 keys instead of pre-signed URLs
**Labels:** `data-integrity`, `security`, `medium`
`blob_url` column stores full URLs which may contain AWS signatures. Store only S3 keys and generate pre-signed URLs on-demand with short expiration.
**Effort:** 2-3 hours

### Issue #3.4 — [LOW] Fix protocol version numbering race condition
**Labels:** `data-integrity`, `low`
Read-then-write version increment can produce duplicates under concurrent requests. Add UNIQUE constraint on `(patient_id, version)` and use atomic increment.
**Effort:** 1 hour

---

## Epic 4: Production Readiness
> Scale and reliability improvements for onboarding more practitioners.

### Issue #4.1 — [MEDIUM] Increase connection pool and optimize long-running queries
**Labels:** `production`, `medium`
Pool max is 10. Prep brief generation holds a connection for 30-60 seconds. Increase pool to 20-25 and refactor long-running ops to release connections after data gathering.
**Effort:** 1-2 hours

### Issue #4.2 — [MEDIUM] Add pagination to list endpoints
**Labels:** `production`, `medium`
Patient list and record queries return all rows. Add cursor-based pagination.
**Effort:** 3-4 hours

### Issue #4.3 — [MEDIUM] Log silent failures instead of swallowing them
**Labels:** `production`, `medium`
Five routes use empty catch blocks for "non-fatal" operations. Log at warning level with context.
**Effort:** 1-2 hours

### Issue #4.4 — [MEDIUM] Wrap GET routes in error handlers
**Labels:** `production`, `medium`
Some GET handlers lack try/catch. Create a `withErrorHandling()` wrapper for all routes.
**Effort:** 1-2 hours

### Issue #4.5 — [MEDIUM] Make disclaimer text configurable per tenant
**Labels:** `production`, `medium`
Hardcoded disclaimer text. Move to per-tenant settings.
**Effort:** 1-2 hours

### Issue #4.6 — [LOW] Validate and sanitize practitioner preferences before prompt injection
**Labels:** `production`, `security`, `low`
Practitioner preference text is inserted directly into AI prompts. Add length limits, strip instruction-like patterns, wrap in delineated XML sections.
**Effort:** 2-3 hours

---

## Epic 5: Frontend Polish (Post-MVP)

### Issue #5.1 — [LOW] Split large component files
### Issue #5.2 — [INFO] Add loading skeleton screens
### Issue #5.3 — [INFO] Add optimistic updates to form saves
### Issue #5.4 — [LOW] Sync clipboard copy with rendered brief fields
### Issue #5.5 — [LOW] Use deep equality instead of JSON.stringify for reset button
