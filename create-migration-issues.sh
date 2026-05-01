#!/bin/bash
# Run this from the clinical-signal-main directory after authenticating with: gh auth login
# Creates all GitHub issues for the Vercel → Railway migration

set -e

echo "Creating parent issue..."
PARENT=$(gh issue create \
  --title "Migrate from Vercel to Railway — eliminate function timeout limit" \
  --body "$(cat <<'EOF'
## Why

Vercel serverless functions have a hard 300-second timeout (Pro plan). Our protocol generation calls the Claude API which routinely takes 3–5 minutes. This timeout has **never** allowed protocol generation to work reliably for practitioners. Every workaround (reducing tokens, switching models, polling) is a band-aid. We need a platform that runs Next.js as a long-running server with no timeout.

## Why Railway

- **No function timeout** — Railway runs Next.js as a persistent Node.js server, not serverless functions. API routes can run as long as needed.
- **GitHub auto-deploy** — same push-to-deploy workflow as Vercel
- **Simple env vars** — dashboard UI, same as Vercel
- **Affordable** — ~$5/month base + usage-based compute
- **Next.js support** — first-class, uses `next start` with standalone output

## Migration plan

1. Configure Next.js for standalone output mode
2. Set up Railway project linked to GitHub repo
3. Copy all environment variables
4. Deploy and test locally with `next start`
5. Test protocol generation end-to-end on Railway
6. Point domain to Railway
7. Remove Vercel project
8. Restore claude-sonnet-4-5 as the AI model (currently downgraded to Haiku due to timeout)

## Acceptance criteria

- [ ] Protocol generation works reliably for any patient data size
- [ ] No timeout errors for practitioners
- [ ] All existing features work (auth, uploads, PDF export, etc.)
- [ ] Custom domain configured with HTTPS
- [ ] Auto-deploy from main branch
- [ ] Haiku model replaced with Sonnet for clinical quality

## Sub-issues

See linked issues below.
EOF
)" \
  --label "infrastructure")

echo "Parent issue created: $PARENT"
PARENT_NUM=$(echo "$PARENT" | grep -o '[0-9]*$')

echo "Creating sub-issues..."

# Sub-issue 1: Configure Next.js standalone output
gh issue create \
  --title "Configure Next.js for standalone output mode" \
  --body "$(cat <<EOF
**Parent:** #${PARENT_NUM}

## What

Railway (and most non-Vercel hosts) needs Next.js configured for standalone output. This produces a self-contained build that doesn't depend on node_modules at runtime.

## Changes needed

1. In \`apps/web/next.config.js\` (or \`.mjs\`), add:
   \`\`\`js
   output: 'standalone'
   \`\`\`
2. Create a \`Dockerfile\` or ensure Railway's nixpacks detects the Next.js app correctly
3. Verify \`next build\` produces the \`.next/standalone\` directory
4. Test locally with:
   \`\`\`bash
   cd apps/web
   npm run build
   node .next/standalone/server.js
   \`\`\`
5. Ensure all API routes work (auth, uploads, protocol generation, PDF export)

## Notes

- If using a monorepo, Railway needs to know the root is \`apps/web\`. Set the root directory in Railway project settings.
- Static assets need to be copied: \`cp -r .next/static .next/standalone/.next/static\`
- Public folder too: \`cp -r public .next/standalone/public\`

## Acceptance criteria

- [ ] \`next build\` succeeds with standalone output
- [ ] \`node .next/standalone/server.js\` starts and serves the app locally
- [ ] All API routes respond correctly
EOF
)"

# Sub-issue 2: Set up Railway project
gh issue create \
  --title "Set up Railway project and link GitHub repo" \
  --body "$(cat <<EOF
**Parent:** #${PARENT_NUM}

## What

Create the Railway project, connect it to the GitHub repo, and configure build settings.

## Steps

1. Create a Railway account at https://railway.app
2. Create a new project → "Deploy from GitHub repo"
3. Select the clinical-signal-main repository
4. Configure build settings:
   - **Root directory:** \`apps/web\` (since this is a monorepo)
   - **Build command:** \`npm run build\`
   - **Start command:** \`node .next/standalone/server.js\`
5. Set the deploy branch to \`main\`

## Notes

- Railway auto-detects Next.js and uses nixpacks for builds
- If auto-detection doesn't work with the monorepo, we may need a \`railway.toml\` or Dockerfile
- Railway provides a default \`*.up.railway.app\` domain for testing before pointing the real domain

## Acceptance criteria

- [ ] Railway project exists and is linked to GitHub
- [ ] Pushing to main triggers a build
- [ ] Build completes successfully
EOF
)"

# Sub-issue 3: Environment variables
gh issue create \
  --title "Copy environment variables to Railway" \
  --body "$(cat <<EOF
**Parent:** #${PARENT_NUM}

## What

Copy all environment variables from Vercel to Railway. These are critical for the app to function.

## Required env vars

Copy these from Vercel dashboard → Settings → Environment Variables:

### Database
- \`DATABASE_URL\` — Neon PostgreSQL connection string
- \`PHI_ENCRYPTION_KEY\` — AES key for encrypting PHI at rest

### Auth
- \`NEXTAUTH_SECRET\` — session signing key
- \`NEXTAUTH_URL\` — will need to be updated to new Railway URL, then final domain

### AI
- \`ANTHROPIC_API_KEY\` — Claude API key
- \`ANTHROPIC_MODEL\` — set back to \`claude-sonnet-4-5\` (currently \`claude-haiku-4-5\` due to Vercel timeout)

### Storage
- \`S3_BUCKET\`, \`S3_REGION\`, \`AWS_ACCESS_KEY_ID\`, \`AWS_SECRET_ACCESS_KEY\` — if using S3 for file storage

### App config
- \`SESSION_IDLE_MINUTES\` — set to \`120\`
- \`MAX_ANALYSIS_TOKENS\` — can increase back to \`16000\` once on Railway (no timeout!)
- \`MAX_PROTOCOL_TOKENS\` — can increase back to \`16000\`
- \`KB_CONTEXT_LIMIT\` — can increase back to \`12\`
- \`DOC_TEXT_CAP\` — can increase back to \`8000\`

## Important

- \`NEXTAUTH_URL\` must match the actual URL the app is served at
- Double-check the \`DATABASE_URL\` includes \`?sslmode=require\` for Neon
- After migration, we can INCREASE token limits and KB context since there's no timeout constraint

## Acceptance criteria

- [ ] All env vars set in Railway
- [ ] App starts successfully with the new config
- [ ] Auth works (login/logout)
- [ ] Database queries work (patient list loads)
EOF
)"

# Sub-issue 4: Test protocol generation
gh issue create \
  --title "Test protocol generation end-to-end on Railway" \
  --body "$(cat <<EOF
**Parent:** #${PARENT_NUM}

## What

The whole point of this migration. Verify that protocol generation runs to completion without timeout errors.

## Test plan

1. Log in as Dr. Laura's test account
2. Navigate to Donna G (existing test patient with GI Map, transcript, and practitioner notes)
3. Click "Generate protocol"
4. Verify:
   - [ ] Step 1 (analysis) completes — should reference GI Map data and transcript
   - [ ] Step 2 (protocol generation) completes — should use knowledge base
   - [ ] Protocol view loads with both clinical protocol and client action plan
   - [ ] No timeout errors
   - [ ] Protocol references the GI Map stool test (not recommending one be ordered)
   - [ ] Transcript nuances are reflected in the analysis

## After confirming it works

- Set \`ANTHROPIC_MODEL\` back to \`claude-sonnet-4-5\` (restore full clinical quality)
- Increase \`MAX_ANALYSIS_TOKENS\` to \`16000\`
- Increase \`MAX_PROTOCOL_TOKENS\` to \`16000\`
- Increase \`KB_CONTEXT_LIMIT\` to \`12\`
- Increase \`DOC_TEXT_CAP\` to \`8000\`
- Regenerate the protocol and compare quality

## Acceptance criteria

- [ ] Protocol generates successfully with no timeout
- [ ] Clinical quality is acceptable (references all uploaded data)
- [ ] Dr. Laura can test without errors
EOF
)"

# Sub-issue 5: Domain and DNS
gh issue create \
  --title "Point domain to Railway and configure HTTPS" \
  --body "$(cat <<EOF
**Parent:** #${PARENT_NUM}

## What

Move the custom domain (if any) from Vercel to Railway, or use Railway's provided domain.

## Steps

1. In Railway dashboard → project → Settings → Domains
2. Add custom domain (if we have one) or use the Railway-provided \`.up.railway.app\` domain
3. If custom domain:
   - Update DNS CNAME record to point to Railway
   - Railway handles HTTPS/TLS automatically via Let's Encrypt
4. Update \`NEXTAUTH_URL\` env var to match the new domain
5. Test login flow with new domain (session cookies are domain-bound)

## If no custom domain yet

- Use Railway's default domain for now
- Update the alpha test guide and Dr. Laura with the new URL
- Set up a proper domain later

## Acceptance criteria

- [ ] App accessible at the correct URL
- [ ] HTTPS working
- [ ] Auth works with the new domain
- [ ] Dr. Laura can access and use the app
EOF
)"

# Sub-issue 6: Decommission Vercel
gh issue create \
  --title "Decommission Vercel project" \
  --body "$(cat <<EOF
**Parent:** #${PARENT_NUM}

## What

Once Railway is confirmed working, remove the Vercel deployment to avoid confusion and unnecessary costs.

## Steps

1. Verify Railway deployment is stable for at least 24 hours
2. Confirm Dr. Laura has tested successfully on Railway
3. In Vercel dashboard:
   - Remove the custom domain (if pointed at Vercel)
   - Delete the project (or just disconnect the GitHub repo)
4. Remove any Vercel-specific config from the codebase:
   - \`vercel.json\` (if exists)
   - \`maxDuration\` exports from API routes (no longer needed)
   - Any Vercel-specific edge config
5. Update CLAUDE.md and any documentation referencing Vercel

## Do NOT do this until

- [ ] Railway has been running stably for 24+ hours
- [ ] Dr. Laura has completed at least one full test
- [ ] All features verified working on Railway

## Acceptance criteria

- [ ] Vercel project removed or disconnected
- [ ] No Vercel-specific code remaining
- [ ] Documentation updated
EOF
)"

echo ""
echo "All issues created! Check: gh issue list"
