# Sprint 5: End-to-End Tests + UI Polish

## Part 1: End-to-End Test Suite (do this first)

Set up Playwright for end-to-end testing against the local dev server. Tests should cover the core practitioner workflow.

### Setup
- [ ] Install Playwright as a dev dependency in apps/web
- [ ] Create playwright.config.ts pointing at localhost:3000
- [ ] Add a test:e2e script to package.json
- [ ] Create a test fixtures file with synthetic test data (DO NOT use real patient data)

### Test Cases (in order of priority)
- [ ] **Auth flow**: Sign up → log in → see dashboard → log out → redirect to login
- [ ] **Patient creation**: Log in → click "New patient" → fill form → submit → see patient in list
- [ ] **Intake form**: Navigate to patient → fill intake form → submit → see intake review
- [ ] **Intake hub**: Navigate to intake hub → paste transcript → see it in document list
- [ ] **Lab upload**: Navigate to records → upload a small test PDF → see extracted text
- [ ] **Protocol generation**: Navigate to protocol page → click generate → wait for completion → see protocol view (this one may need longer timeout — use 5 minutes)
- [ ] **Protocol editor**: Navigate to edit → change title → save as new version → see v2
- [ ] **Protocol export**: Click Clinical PDF link → verify response is application/pdf
- [ ] **Session expiry**: Verify that expired sessions return 401 JSON from API routes (not HTML redirects)

### Technical Notes
- Use a dedicated test tenant and test practitioner created in a beforeAll hook
- Clean up test data in afterAll
- For the PDF upload test, create a minimal synthetic PDF with pdf-lib (a few lines of text)
- Protocol generation test needs a generous timeout (5 min) since it calls Claude API
- If Claude API key is not available in test env, skip the protocol generation test with test.skip()
- Run against local Next.js dev server, NOT production

## Part 2: UI Polish Pass (do this after tests are passing)

Go through every user-facing page and fix issues. Commit after each page/area.

### Dashboard
- [ ] Loading skeleton matches actual content layout
- [ ] Empty state when no patients exist is helpful
- [ ] Patient status badges are clear and consistent
- [ ] Works on mobile (responsive)

### Patient Detail
- [ ] All tabs/sections have consistent spacing
- [ ] Loading states for each section
- [ ] Error states show actionable messages (not raw JSON or stack traces)
- [ ] Back navigation works correctly from all sub-pages

### Intake Hub
- [ ] File upload dropzone works on mobile
- [ ] Large file uploads show progress
- [ ] Document list handles many documents gracefully
- [ ] Empty states for each tab

### Protocol View
- [ ] Long protocol content doesn't break layout
- [ ] Side-by-side panels stack on mobile
- [ ] Section headings are scannable
- [ ] Print styles work (Cmd+P produces clean output)

### Protocol Editor
- [ ] All form fields have proper labels
- [ ] Tab order makes sense
- [ ] Toolbar stays visible while scrolling
- [ ] Mobile: panels stack, toolbar wraps gracefully

### General
- [ ] All pages have proper document titles (<title> tag)
- [ ] No console errors or warnings on any page
- [ ] Favicon is set
- [ ] 404 page exists and looks correct
- [ ] Error boundary catches runtime errors gracefully

## Acceptance Criteria
- [ ] Playwright tests pass locally
- [ ] No TypeScript errors
- [ ] All user-facing pages reviewed and polished
- [ ] Commit after each logical unit of work
