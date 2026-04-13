# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Clinical Signal** is a web platform for functional health practitioners to securely upload patient records, perform AI-driven deep historical analysis of medical history, and generate clinical protocols. The primary user is a solo high-touch functional health practitioner who manages 5-15 active clients with daily messaging and 2-4 monthly calls over 4-6 month engagements.

The core value proposition is turning lab results into both a clinical protocol AND a phased client-facing action plan in minutes instead of hours. This is the single biggest time bottleneck for practitioners — protocol creation caps how many clients they can take on.

### Real-World Practitioner Workflow

This workflow comes from Dr. Laura, a functional health doctor who trains 35+ practitioners. The software must support this exact flow.

1. **Discovery call** — practitioner and patient determine fit (out of scope for software)
2. **Onboarding and intake** — patient fills out structured intake forms covering symptoms, health history, lifestyle, goals, previous labs, and wearable data
3. **Lab ordering decision** — based on intake data, practitioner decides which labs to order. Some customize per patient; others have standard panels. AI suggests labs based on intake.
4. **Foundational period** — labs take 1-3 weeks. During this time, practitioner assigns foundational work (sleep, nutrition, mindset, daily habits). System provides assignable checklists.
5. **Lab upload and ingestion** — practitioner uploads PDF lab results. AI extracts and structures the data.
6. **Protocol generation (THE CORE FEATURE)** — AI analyzes all patient data and produces TWO outputs:
   - **Output A: Clinical Protocol** — comprehensive practitioner-facing document with all findings, recommendations, and clinical reasoning
   - **Output B: Phased Client Action Plan** — same protocol translated into plain language, broken into phases so the patient doesn't get overwhelmed. Must understand clinical sequencing (e.g., address HPA axis and gut simultaneously before hormones).
7. **Practitioner review and edit** — practitioner applies clinical judgment, edits both outputs, and finalizes
8. **Protocol delivery** — export as PDF or printable view for sharing with patient

### Critical Domain Knowledge

Functional health practitioners think differently from conventional medicine. The AI must:
- Think in systems and root causes, not isolated symptoms
- Understand clinical sequencing (what to address first and why)
- Recognize interconnections (gut health impacts hormones impacts weight)
- Produce phased plans that prevent patient overwhelm — giving everything at once causes non-compliance
- Use warm, clear language in client-facing output that a patient would actually follow

### MVP Boundaries

**In scope:** Steps 2-8 above. Patient onboarding, intake forms, lab guidance, foundational checklists, lab PDF upload with AI extraction, dual-output protocol generation, practitioner editing, and PDF export.

**Explicitly out of scope for MVP:** Patient portal/login, wearable integrations, FullScript/Rupa Health integration, real-time messaging, multi-practitioner team features, automated lab reordering, course hosting, payment processing, practice management (scheduling, billing).

## Architecture

See ARCHITECTURE.md for the full technical architecture. Summary: Next.js 14+ frontend (TypeScript, App Router), Python FastAPI analysis engine, PostgreSQL with Row-Level Security, S3 for document storage, Claude API for clinical analysis (BAA required).

## Security Requirements

This application handles Protected Health Information (PHI) subject to HIPAA. Every feature must be evaluated through this lens:

- All API endpoints handling PHI require authentication and authorization
- Patient data storage must use AES-256 encryption at rest
- TLS 1.2+ required for all data in transit
- Session management must enforce timeouts appropriate for clinical use (15 min default)
- Audit logs must capture all access to patient records (who, what, when)
- AI API calls containing PHI require a Business Associate Agreement with the provider
- File uploads must be validated, scanned, and stored outside the web root
- No PHI in application logs, error messages, or client-side storage
- PostgreSQL RLS enforces tenant isolation at the database layer
- Server-side rendering for PHI — patient data never in browser JS runtime

## Build Order

Build the MVP in this order. Each step should be a separate GitHub issue. Complete, test, and merge one before starting the next.

### Sprint 1: Foundation
1. Project bootstrap — scaffold Next.js + FastAPI + PostgreSQL per ARCHITECTURE.md directory structure, Docker Compose for local dev, get it running locally
2. Authentication — NextAuth.js with database sessions, email+password, session timeouts, password policy
3. Database schema — all core entities from ARCHITECTURE.md with RLS policies, migrations, synthetic seed data
4. Dashboard — practitioner sees list of patients with status indicators

### Sprint 2: Patient Data
5. New patient creation — form to create a patient record
6. Intake form — structured form: symptoms, history, goals, lifestyle, previous labs
7. Intake review — practitioner views completed intake data

### Sprint 3: Labs
8. Lab PDF upload — upload interface, file validation, secure S3 storage
9. Lab extraction — Python pipeline: PDF text extraction, Claude API for structuring into lab values
10. Lab review — practitioner sees extracted values, can correct errors

### Sprint 4: Protocol Engine
11. Lab suggestion — AI recommends labs based on intake data
12. Protocol generation — AI produces Output A (clinical protocol) and Output B (phased client plan)
13. Protocol editor — side-by-side editing of both outputs
14. Protocol export — clean PDF generation

### Sprint 5: Polish
15. Foundational checklist — assignable topics for the lab waiting period
16. Audit log viewer — compliance reporting
17. End-to-end testing and UI polish

## Development (To Be Established)

This repo is not yet bootstrapped. When setting up the project:

- Follow the directory structure in ARCHITECTURE.md
- Document build, test, and run commands in this section once established
- All environment-specific config (API keys, DB credentials) goes in `.env` files which must be `.gitignore`d
- Use synthetic patient data for development and staging — PHI never exists outside production
- System prompts for AI analysis go in `services/analysis-engine/prompts/` and are version-controlled
