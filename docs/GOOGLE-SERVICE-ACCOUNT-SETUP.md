# Google Service Account Setup — Drive Watcher Auth

**Purpose:** Provision a Google Cloud service account so the Drive watcher (Phase 5 of `HISTORICAL-BATCH-INGEST-DESIGN.md`) and the one-time historical batch can authenticate to Google Drive without OAuth or human-in-the-loop steps.

**Audience:** Ryan, doing this once. Takes 30-60 minutes including the Drive sharing step.

**What you'll produce:**
- A service account email like `clinical-signal-drive-reader@<project-id>.iam.gserviceaccount.com`
- A JSON key file saved to `infrastructure/secrets/google-service-account.json` (gitignored)
- Both Dr. Laura's Drive folders shared with that service account as Viewer

---

## Architecture decision

A service account is a non-human identity owned by a Google Cloud project. It has its own email and authenticates via a JSON private key rather than a username/password. We use a service account (not OAuth on Ryan's personal account) for three reasons:

1. **Durability** — OAuth tokens expire and require periodic re-consent; service account keys don't.
2. **Cron-compatible** — the watcher runs on an hourly schedule with no human nearby.
3. **Auditability** — every Drive API call shows up under the service account's identity, not Ryan's, so production access is separately auditable.

The service account doesn't *own* anything. Dr. Laura still owns the Drive folders. She (or whoever owns them) explicitly shares them with the service account email as Viewer. Removing access is a one-click revoke of the share.

---

## Prerequisites

- A Google account with Cloud Console access (Ryan's `hebrewhammer@hebrew-hammer.com` works — Cloud Console doesn't require a workspace, free tier is fine).
- Ability to either share the Drive folders yourself (if you own them) or message Dr. Laura to share them with the service account email (if she owns them).

The two folder IDs that need sharing:

- `161VCvz43IVXDGuO3M2JPZamp1K5HZCGe` — Slack Export - Mentorship
- `1f4PY0gvedz-FX8qouKCfARATmXKIYsFf` — Clinical Signal Sources

---

## Step-by-step

### 1. Create (or pick) a Google Cloud project

Open [console.cloud.google.com](https://console.cloud.google.com). If you've never used Cloud Console, you'll be prompted to accept terms — do that, free tier is sufficient.

In the top bar, click the project dropdown → **New Project**:

- **Project name:** `clinical-signal` (or whatever — but lowercase, no spaces)
- **Organization:** leave as "No organization" if you don't have a Google Workspace; otherwise pick the appropriate org
- **Location:** leave default

Click **Create**, wait ~10 seconds for the project to provision, then confirm it's selected in the top bar.

**Note the project ID** (shown under the project name — looks like `clinical-signal-449821` or similar). You'll see it again in the service account email.

### 2. Enable the Google Drive API

In the left sidebar (or use the search bar at the top): **APIs & Services → Library**.

Search for "Google Drive API". Click it, then click **Enable**. Wait ~15 seconds.

You should land on the Drive API overview page once enabled. If you don't, refresh and confirm via APIs & Services → Enabled APIs & services that Google Drive API is in the list.

### 3. Create the service account

**APIs & Services → Credentials → Create Credentials → Service Account.**

- **Service account name:** `clinical-signal-drive-reader`
- **Service account ID:** auto-fills from the name — leave it
- **Description:** "Reads Dr. Laura's Drive folders for KO ingestion" (optional but useful for your future self)

Click **Create and Continue**.

The next screen asks for project-level roles. **Skip it** — leave blank and click **Continue**. Project-level roles are irrelevant here; Drive access is granted at the folder-share level, not via IAM roles on the project.

Skip the third screen ("Grant users access to this service account") too — click **Done**.

You should now see the service account in the Credentials list. **Copy its email** (e.g. `clinical-signal-drive-reader@clinical-signal-449821.iam.gserviceaccount.com`) — you'll need it in step 6.

### 4. Create and download the JSON key

Click the service account name to open it. Go to the **Keys** tab → **Add Key → Create new key**.

- **Key type:** JSON
- Click **Create**

A JSON file downloads to your machine immediately. Filename will be something like `clinical-signal-449821-abc123def456.json`. Don't lose it — this is the only time Google lets you download this specific key.

### 5. Save the key to the project

```bash
mkdir -p ~/clinical-signal-main/infrastructure/secrets
mv ~/Downloads/clinical-signal-449821-*.json ~/clinical-signal-main/infrastructure/secrets/google-service-account.json
```

(Adjust the filename based on what actually downloaded.)

**Verify it's gitignored.** If Phase 1 (`feat/batch-phase-1-hardening`) has merged, `infrastructure/secrets/` is already in `.gitignore`. If not, add it yourself:

```bash
cd ~/clinical-signal-main
grep -q "^infrastructure/secrets" .gitignore || echo "infrastructure/secrets/" >> .gitignore
git status  # confirm the key file does NOT show up as a new file
```

If `git status` shows the JSON key as untracked, **do not commit it**. Re-check `.gitignore`.

### 6. Share both Drive folders with the service account

This is the step that actually grants access. The service account currently has no access to any Drive content; sharing is how that changes.

**If you own the folders** (you've created them and they're under your Drive): open each folder in Drive in the browser, click **Share**, paste the service account email from step 3, set role to **Viewer**, **uncheck** "Notify people" (the service account doesn't have an inbox), click **Send**.

**If Dr. Laura owns the folders** (the likely case — she shared them with you): send her a quick message:

> Hi Laura — quick favor for the Clinical Signal ingestion pipeline. Can you share the two Drive folders with `clinical-signal-drive-reader@clinical-signal-449821.iam.gserviceaccount.com` (set to Viewer, uncheck "notify people")? The folders are:
> 1. Slack Export - Mentorship (folder ID `161VCvz43IVXDGuO3M2JPZamp1K5HZCGe`)
> 2. Clinical Signal Sources (folder ID `1f4PY0gvedz-FX8qouKCfARATmXKIYsFf`)
>
> It's a service account, not a person — it just gives the ingestion script a stable login. No notification email needed.

Replace the email with your actual service account email.

### 7. Verify access

Two ways to verify:

**Manual verification (immediate):** Open each folder in Drive in the browser. Click **Share**. The service account email should appear in the list with role "Viewer". If both folders show it, sharing is done.

**Functional verification (after Phase 1 lands):** Once `verify_drive_access.py` is on `main`:

```bash
cd ~/clinical-signal-main
docker compose exec analysis python scripts/verify_drive_access.py
```

Expected output: file count + first 5 filenames for each of the two folders, then exit 0.

If you get `403 Permission denied`: step 6 isn't done for that folder, or the email was typo'd. Re-check both shares.

If you get `404 File not found`: the folder ID is wrong (unlikely — they're hardcoded from the design doc) or the service account doesn't have access yet.

If you get `API has not been enabled`: step 2 was skipped or you're authenticating against a different project. The project ID is embedded in the service account email — confirm it matches the project where you enabled the Drive API.

---

## Security notes

- **Never commit the JSON key.** It's a private key. Anyone with it has Viewer access to both folders forever (or until rotated). The `.gitignore` entry above is the only thing standing between you and a key leak.

- **Production deployment** (Aptible): the JSON key gets uploaded as an Aptible secret, not committed. When the watcher deploys, set an environment variable `GOOGLE_APPLICATION_CREDENTIALS_JSON` to the contents of the key and have the script write it to a temp file on container start, or use Aptible's secrets-as-files feature if available. The local `infrastructure/secrets/` path is dev-only.

- **Rotation.** Google service-account keys don't expire by default, but it's good hygiene to rotate annually or whenever a contractor with key access rolls off. Cloud Console → Service Account → Keys → Delete the old key after creating and deploying the new one.

- **Revocation.** If the key leaks or you suspect compromise: Cloud Console → Service Account → Keys → Delete. The watcher will start failing on the next run. Also revoke the folder shares as belt-and-suspenders.

- **Scope.** This service account only has read access to two specific folders. It can't see your other Drive content, can't see anyone else's Drive content, and can't write anywhere. The blast radius is intentionally small.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Cloud Console asks for billing info during project creation | Not needed — Drive API is free tier. Skip / "Use free tier". |
| Can't find "Create Credentials → Service Account" | You're in the wrong project. Confirm the project name in the top bar. |
| Service account email shows `@<project-id>.iam.gserviceaccount.com` but folder share dialog rejects it | Drive sharing sometimes balks at the long email. Try pasting it without trailing whitespace; confirm spelling. |
| `verify_drive_access.py` reports two folders but zero files in one | Service account has access to the folder itself but not its contents. This shouldn't happen with normal sharing — re-do step 6 for that folder and pick "Viewer" not some other role. |
| Drive API works locally but fails on Aptible | Aptible doesn't have the JSON key in its filesystem. See "Production deployment" in Security notes above. |
| Google sends a "new device sign-in" email when you create the key | This is for *your* account, not the service account — it's just Google noting the Cloud Console session. Ignore it. |

---

## What's downstream

Once this is done, the service account is reusable for everything Drive-related in Clinical Signal — not just the historical batch and the watcher, but eventually:

- Practitioner-side Drive integration (if Layer D ever supports "connect your Drive" as an upload path)
- External-leader content ingestion if any of those leaders share files via Drive
- Any future Google Workspace integrations (Docs, Sheets, Calendar)

The same JSON key authenticates everything; folder shares scope what each integration can see.

---

## Companion docs

- `docs/HISTORICAL-BATCH-INGEST-DESIGN.md` — phase plan this auth setup unblocks
- `docs/CLAUDE-CODE-PROMPT-BATCH-PHASE-1-HARDENING.md` — `verify_drive_access.py` script implementation
- `docs/SYNC-DRIVE-CONTENT-DESIGN.md` — eventual Drive watcher this auth feeds
- `docs/DRIVE-WATCHER-PHASE-0-WALKTHROUGH.md` — earlier (now obsolete) version of this setup; superseded by this doc
