# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Clinical Signal** is a web platform for functional health practitioners to securely upload patient records, perform AI-driven deep historical analysis of medical history, and generate clinical protocols. The primary user is a functional health practitioner.

### Core Workflow

1. Practitioner uploads patient records (labs, intake forms, clinical notes)
2. System ingests and structures the data
3. AI performs a deep historical dive across the patient's full medical history
4. AI generates insights, pattern detection, and protocol recommendations
5. Practitioner reviews, edits, and finalizes protocols

## Architecture (Planned)

This is a greenfield project. Architecture decisions should prioritize:

- **HIPAA compliance** — all patient data must be encrypted at rest and in transit; access controls enforced; audit logging required
- **PHI isolation** — patient health information must never be sent to AI providers without proper BAA coverage; consider de-identification pipelines
- **Multi-tenant awareness** — the platform will serve multiple practitioners (mentorship group members and consulting clients)
- **Document ingestion pipeline** — support for PDFs, images (OCR), structured lab data (HL7/FHIR where applicable), and free-text clinical notes

## Security Requirements

This application handles Protected Health Information (PHI) subject to HIPAA. Every feature must be evaluated through this lens:

- All API endpoints handling PHI require authentication and authorization
- Patient data storage must use AES-256 encryption at rest
- TLS 1.2+ required for all data in transit
- Session management must enforce timeouts appropriate for clinical use
- Audit logs must capture all access to patient records (who, what, when)
- AI API calls containing PHI require a Business Associate Agreement with the provider
- File uploads must be validated, scanned, and stored outside the web root
- No PHI in application logs, error messages, or client-side storage

## Development (To Be Established)

This repo is not yet bootstrapped. When setting up the project:

- Choose a stack that supports the security requirements above
- Document build, test, and run commands in this section once established
- All environment-specific config (API keys, DB credentials) goes in `.env` files which must be `.gitignore`d
