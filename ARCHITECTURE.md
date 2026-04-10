# Architecture — Clinical Signal

## System Overview

Clinical Signal is a two-service architecture: a **Next.js application** handling the practitioner-facing experience and a **Python analysis engine** handling document ingestion, medical record processing, and AI-driven clinical analysis. PostgreSQL stores structured data. S3-compatible object storage holds encrypted document blobs.

```
┌─────────────────────────────────────────────────────────────┐
│                      Practitioner Browser                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ TLS 1.3
┌──────────────────────────▼──────────────────────────────────┐
│                   Next.js Application                        │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────────────┐  │
│  │ React UI   │ │ API Routes   │ │ Server Actions        │  │
│  │ (App Router)│ │ /api/*       │ │ (auth, CRUD, upload)  │  │
│  └────────────┘ └──────┬───────┘ └───────────┬───────────┘  │
│                        │                     │               │
│  ┌─────────────────────┴─────────────────────┘              │
│  │ Auth middleware · RBAC · Audit logger · Rate limiter      │
│  └─────────────────────┬────────────────────────────────────│
└────────────────────────┼────────────────────────────────────┘
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌────────────┐ ┌───────────┐ ┌─────────────────────────────┐
   │ PostgreSQL │ │ S3 Bucket │ │  Python Analysis Engine      │
   │ (RLS)      │ │ (SSE-KMS) │ │  ┌─────────────────────┐    │
   │            │ │           │ │  │ Document Pipeline    │    │
   │ patients   │ │ /records/ │ │  │ PDF → OCR → Parse →  │    │
   │ records    │ │ /exports/ │ │  │ Structure → Store     │    │
   │ analyses   │ │           │ │  └─────────┬───────────┘    │
   │ protocols  │ │           │ │  ┌─────────▼───────────┐    │
   │ audit_log  │ │           │ │  │ Clinical Analyzer    │    │
   │ tenants    │ │           │ │  │ Claude API (BAA)     │    │
   └────────────┘ └───────────┘ │  │ Pattern detection    │    │
                                │  │ Protocol generation  │    │
                                │  └─────────────────────┘    │
                                └─────────────────────────────┘
```

## Technology Choices and Rationale

### Next.js 14+ (TypeScript) — Application Layer

- **App Router with Server Components** — PHI-bearing data renders server-side; the browser receives HTML, not raw patient JSON. This is a meaningful PHI exposure reduction.
- **API Routes** — handles auth, CRUD, file uploads, and proxies analysis requests to the Python engine. Single origin means no CORS complexity.
- **Server Actions** — form submissions (patient intake, protocol edits) execute server-side with built-in CSRF protection.
- **Why not Python for everything?** The practitioner UI needs a responsive, modern frontend. Next.js gives us React + SSR + API in one deployable unit. The Python service stays focused on what Python does best: document processing and AI.

### Python (FastAPI) — Analysis Engine

- **FastAPI** — async, typed, OpenAPI schema auto-generated. The analysis engine is internal (not public-facing), so FastAPI's speed and simplicity fit well.
- **Why Python?** The document processing pipeline requires libraries that only exist in Python's ecosystem: `pdfplumber`/`PyMuPDF` for PDF extraction, `pytesseract` for OCR, `pandas` for lab data normalization, and the Anthropic Python SDK for Claude API calls. There is no viable TypeScript equivalent for this pipeline.
- **Communication** — Next.js calls the Python engine over an internal HTTP API (not public-facing). In production, both services live in the same VPC/private network.

### PostgreSQL — Structured Data

- **Row-Level Security (RLS)** — enforces tenant isolation at the database layer. Even if application code has a bug, one practitioner cannot query another's patient data. This is the multi-tenancy strategy.
- **pgcrypto** — column-level encryption for highly sensitive fields (SSN, DOB, diagnosis codes) beyond the disk-level encryption provided by the managed service.
- **JSONB columns** — structured lab results and clinical findings vary by record type. JSONB allows flexible schema per record while keeping everything queryable.

### S3-Compatible Object Storage — Documents

- **SSE-KMS encryption** — all uploaded documents encrypted at rest with AWS KMS (or equivalent). Per-tenant KMS keys enable cryptographic tenant isolation.
- **Pre-signed URLs** — documents are never served through the application. The app generates time-limited, scoped pre-signed URLs for download. This keeps document bytes off the app server.
- **Lifecycle policies** — configurable retention periods per tenant for regulatory compliance.

### Anthropic Claude API — Clinical Analysis

- **BAA coverage** — Anthropic offers Business Associate Agreements for enterprise accounts, making Claude a HIPAA-eligible AI processor.
- **Why Claude?** Long context window (200K tokens) is critical for analyzing a patient's full medical history in a single pass — years of labs, notes, and records. Structured output mode enables reliable extraction of clinical findings into typed data structures.
- **Prompt architecture** — system prompts encode clinical analysis frameworks; patient data goes in the user message. System prompts contain no PHI and can be version-controlled.

## Data Model

### Core Entities

```
tenants
├── id (UUID)
├── name
├── subscription_tier
├── kms_key_arn
└── settings (JSONB)

practitioners (belong to tenant)
├── id (UUID)
├── tenant_id (FK → tenants) ← RLS policy column
├── email (encrypted)
├── name
├── role (owner | practitioner | viewer)
├── credentials (JSONB — license type, NPI, etc.)
└── last_login_at

patients (belong to tenant)
├── id (UUID)
├── tenant_id (FK → tenants) ← RLS policy column
├── practitioner_id (FK → practitioners)
├── name_encrypted (pgcrypto)
├── dob_encrypted (pgcrypto)
├── intake_data (JSONB)
└── created_at

records (belong to patient)
├── id (UUID)
├── tenant_id ← RLS policy column
├── patient_id (FK → patients)
├── record_type (lab | clinical_note | imaging | intake_form | other)
├── source_file_key (S3 key)
├── extracted_text (encrypted TEXT — OCR/parsed output)
├── structured_data (JSONB — normalized lab values, parsed fields)
├── record_date (date of the clinical event, not upload date)
├── processing_status (pending | processing | complete | failed)
└── uploaded_at

analyses (belong to patient)
├── id (UUID)
├── tenant_id ← RLS policy column
├── patient_id (FK → patients)
├── practitioner_id (FK — who requested it)
├── analysis_type (full_history | focused | follow_up)
├── input_record_ids (UUID[] — which records were analyzed)
├── findings (JSONB — structured clinical findings)
├── raw_ai_response (encrypted TEXT)
├── model_id (which Claude model + version)
├── token_usage (JSONB — input/output/cache tokens)
├── created_at
└── status (running | complete | failed)

protocols (belong to patient, derived from analysis)
├── id (UUID)
├── tenant_id ← RLS policy column
├── patient_id (FK → patients)
├── analysis_id (FK → analyses)
├── practitioner_id (FK — who owns this protocol)
├── title
├── content (JSONB — structured protocol sections)
├── status (draft | review | finalized)
├── version (integer — incremented on edit)
├── finalized_at
└── updated_at

audit_log (append-only, no RLS — admin access only)
├── id (BIGSERIAL)
├── tenant_id
├── practitioner_id
├── action (view_patient | download_record | run_analysis | edit_protocol | export | ...)
├── resource_type
├── resource_id
├── ip_address
├── user_agent
├── metadata (JSONB)
└── created_at
```

### Row-Level Security Strategy

Every table containing PHI includes a `tenant_id` column. PostgreSQL RLS policies ensure:

```sql
CREATE POLICY tenant_isolation ON patients
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

The Next.js API layer sets `app.current_tenant_id` on every database connection from the authenticated session. Even a SQL injection vulnerability cannot cross tenant boundaries because the policy is enforced by PostgreSQL itself.

## Document Ingestion Pipeline

This is the most complex subsystem. It runs asynchronously in the Python analysis engine.

### Pipeline Stages

```
Upload → Validate → Store → Extract → Structure → Index
```

**1. Upload (Next.js)**
- Practitioner uploads files through the UI
- Server Action validates file type (PDF, PNG, JPG, TIFF, HEIC, CSV, TXT), size limits (50MB per file), and runs antivirus scan
- File is streamed directly to S3 (never written to app server disk)
- A `records` row is created with `processing_status = pending`

**2. Validate (Python)**
- Verify file magic bytes match declared content type (not just extension)
- Check for embedded scripts, macros, or malformed structures
- Reject or quarantine suspicious files

**3. Extract (Python)**
- **PDF:** `PyMuPDF` for text-layer PDFs; `pytesseract` for scanned/image PDFs
- **Images:** `pytesseract` OCR with preprocessing (deskew, contrast normalization)
- **CSV/structured:** Direct parsing with `pandas`
- **Clinical documents:** HL7v2 parser for lab feeds if applicable; FHIR JSON parser for structured health data
- Extracted text is encrypted and stored in `records.extracted_text`

**4. Structure (Python)**
- Claude API call with a specialized extraction prompt: "Given this clinical document text, extract structured data"
- Output: normalized lab values with reference ranges, medication lists, diagnosis codes (ICD-10), dates, provider names
- Stored as typed JSONB in `records.structured_data`
- This step uses Claude's structured output mode to enforce a consistent schema

**5. Index**
- Structured data is queryable via PostgreSQL JSONB operators
- Timeline index: all records for a patient ordered by `record_date` for the historical analysis view

### Pipeline Execution

- Jobs are queued via a task queue (Redis + Celery, or `arq` for a lighter footprint)
- Each stage is idempotent — a failed job can be retried without side effects
- Processing status is updated at each stage and visible in the UI
- Failed extractions are flagged for manual review by the practitioner

## Clinical Analysis Engine

The core value proposition. When a practitioner requests an analysis:

### Analysis Flow

```
1. Gather: Collect all structured records for the patient (or selected subset)
2. Assemble: Build a chronological clinical timeline
3. Analyze: Send to Claude with clinical analysis system prompt
4. Structure: Parse Claude's response into typed findings
5. Store: Save analysis with full provenance (which records, which model, token usage)
6. Present: Return findings to the UI for practitioner review
```

### Prompt Architecture

```
┌─────────────────────────────────────────┐
│ System Prompt (version-controlled)       │
│ - Clinical analysis framework            │
│ - Output structure requirements          │
│ - Scope limitations and disclaimers      │
│ - Instructions for uncertainty handling  │
│ NO PHI in system prompt                  │
├─────────────────────────────────────────┤
│ User Message (runtime, contains PHI)     │
│ - Patient timeline (structured records)  │
│ - Practitioner's specific questions      │
│ - Analysis type parameters               │
└─────────────────────────────────────────┘
```

System prompts are stored in the repository under `prompts/` and versioned. Each analysis records which prompt version was used for reproducibility.

### Analysis Types

**Full History Review**
- Input: all patient records
- Output: comprehensive findings across all body systems, medication interactions, trend analysis, pattern detection
- Use case: new patient intake or annual deep review

**Focused Analysis**
- Input: selected records + practitioner's clinical question
- Output: targeted findings relevant to the specific question
- Use case: "evaluate thyroid markers over the past 2 years given current symptoms"

**Follow-Up Comparison**
- Input: current records + previous analysis
- Output: delta — what changed, what improved, what needs attention
- Use case: protocol effectiveness evaluation

## Protocol Generation

After analysis, the practitioner can generate a protocol:

- AI produces a draft protocol based on the analysis findings
- Protocol is structured into sections: summary, dietary recommendations, supplement protocol, lifestyle modifications, lab re-testing schedule, follow-up timeline
- Practitioner edits, adjusts, and finalizes
- Finalized protocols are versioned — edits create new versions, old versions are retained
- Export to PDF for the patient

## Authentication and Authorization

### Authentication

- **NextAuth.js (Auth.js v5)** with database-backed sessions (not JWT — sessions can be revoked server-side)
- **Email + password** with mandatory MFA (TOTP via authenticator app) — HIPAA requires access controls beyond single-factor
- **Session timeout:** 15 minutes of inactivity triggers re-authentication (configurable per tenant)
- **Password policy:** minimum 12 characters, checked against breached password databases (HaveIBeenPwned k-anonymity API)

### Authorization (RBAC)

Three roles per tenant:

| Role | Patients | Records | Analysis | Protocols | Tenant Settings |
|------|----------|---------|----------|-----------|-----------------|
| **Owner** | CRUD | CRUD | Run/View | CRUD | Full access |
| **Practitioner** | CRUD (own) | CRUD (own patients) | Run/View (own) | CRUD (own) | View only |
| **Viewer** | Read (assigned) | Read (assigned) | View (assigned) | Read (assigned) | None |

"Own" means the practitioner is assigned to that patient. Owners see all data within their tenant.

### Authorization Enforcement

Authorization is checked at three layers:
1. **Next.js middleware** — route-level access control (reject before hitting the handler)
2. **API route handlers** — resource-level permission checks
3. **PostgreSQL RLS** — tenant-level isolation (defense in depth)

## Audit Logging

Every action that touches PHI is logged to the `audit_log` table:

- **What:** action type, resource type, resource ID
- **Who:** practitioner ID, tenant ID
- **When:** timestamp
- **Where:** IP address, user agent
- **Context:** additional metadata (e.g., which records were included in an analysis)

The audit log is append-only. No UPDATE or DELETE permissions are granted on this table to any application role. Audit logs are retained for a minimum of 6 years (HIPAA requirement).

A separate read-only database role is used for audit log queries, ensuring the application cannot tamper with logs even if compromised.

## Infrastructure and Deployment

### Target: AWS (HIPAA-Eligible Services)

| Component | AWS Service | HIPAA Eligible |
|-----------|-------------|----------------|
| Next.js app | ECS Fargate or App Runner | Yes |
| Python engine | ECS Fargate | Yes |
| PostgreSQL | RDS (PostgreSQL) | Yes |
| Object storage | S3 | Yes |
| Task queue | ElastiCache (Redis) | Yes |
| KMS | AWS KMS | Yes |
| Secrets | Secrets Manager | Yes |
| Logging | CloudWatch | Yes |
| CDN | CloudFront (static assets only, no PHI) | Yes |

**AWS BAA** must be signed before any PHI touches AWS services.

### Alternative: Simpler Deployment

For early-stage deployment before scaling concerns:
- **Railway** or **Render** with their HIPAA-compliant plans
- Single PostgreSQL instance
- S3-compatible storage (Cloudflare R2 or AWS S3)
- Both services deployed as containers

### Environment Separation

| Environment | Purpose | Data |
|-------------|---------|------|
| `development` | Local development | Synthetic data only, no PHI |
| `staging` | Integration testing | Synthetic data only, no PHI |
| `production` | Live | Real PHI, full encryption, full audit logging |

PHI never exists outside production. Development and staging use synthetic patient data generated by a seed script.

## Directory Structure (Planned)

```
clinical-signal/
├── CLAUDE.md
├── ARCHITECTURE.md
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App Router pages and layouts
│       │   ├── (auth)/         # Login, MFA, password reset
│       │   ├── (dashboard)/    # Authenticated practitioner UI
│       │   │   ├── patients/
│       │   │   ├── records/
│       │   │   ├── analyses/
│       │   │   └── protocols/
│       │   └── api/            # API routes
│       ├── components/
│       ├── lib/                # DB client, auth config, S3 client
│       └── middleware.ts       # Auth + RBAC middleware
├── services/
│   └── analysis-engine/        # Python FastAPI service
│       ├── app/
│       │   ├── api/            # Internal API endpoints
│       │   ├── pipeline/       # Document ingestion stages
│       │   ├── analyzer/       # Clinical analysis logic
│       │   └── models/         # Pydantic models
│       ├── prompts/            # Version-controlled system prompts
│       └── tests/
├── packages/
│   └── shared/                 # Shared types, constants, validation schemas
├── database/
│   ├── migrations/             # SQL migration files (numbered)
│   ├── seed/                   # Synthetic data generators
│   └── policies/               # RLS policy definitions
├── infrastructure/
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   └── Dockerfile.engine
│   └── terraform/              # Infrastructure as code (if AWS)
└── docker-compose.yml          # Local development environment
```

## Key Design Decisions

### Why two services instead of one?

A single Next.js app would be simpler to deploy, but the document processing pipeline requires Python libraries with no TypeScript equivalents. Running OCR, PDF extraction, and pandas-based lab normalization in Python is not optional — it's where the ecosystem exists. The Next.js app stays thin: UI, auth, CRUD. The Python engine does the heavy computation.

### Why PostgreSQL RLS instead of application-level tenant filtering?

Application-level `WHERE tenant_id = ?` works until someone forgets it in one query. RLS enforces isolation at the database engine level. For PHI, "works unless there's a bug" is not acceptable. RLS makes tenant isolation a database invariant, not an application convention.

### Why database sessions instead of JWTs?

JWTs cannot be revoked without maintaining a blocklist (which defeats their purpose). If a practitioner's account is compromised, we need to kill their session immediately. Database sessions support instant revocation. The performance cost of a session lookup is negligible at this scale.

### Why server-side rendering for PHI?

React Server Components render on the server and send HTML to the browser. Patient data never exists in the browser's JavaScript runtime, Redux store, or localStorage. This eliminates an entire class of client-side PHI exposure risks (XSS exfiltration, browser extension access, client-side caching). The browser displays the data but doesn't "have" it in a programmatically accessible way.

### Why not FHIR as the primary data model?

FHIR (Fast Healthcare Interoperability Resources) is designed for health system interoperability. Clinical Signal's users are functional health practitioners uploading PDFs and lab printouts, not hospitals exchanging structured data feeds. FHIR support is included for ingestion (parsing FHIR resources when available) but the internal data model is purpose-built for the analysis workflow. If interoperability with EHR systems becomes a requirement, a FHIR facade can be added.

### Why Claude over other AI providers?

1. **BAA availability** — required for HIPAA-covered PHI processing
2. **200K token context** — a patient's full history (years of labs, notes, records) can exceed 100K tokens. Models with smaller context windows would require chunking and multi-pass analysis, losing cross-record pattern detection
3. **Structured output** — reliable JSON extraction from clinical documents
4. **Instruction following** — clinical analysis requires precise adherence to the analysis framework in the system prompt
