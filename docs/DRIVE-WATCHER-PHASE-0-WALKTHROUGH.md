# Phase 0 — Drive Watcher Setup (Manual, ~10 minutes)

This is the **prerequisite step** before Claude Code can build anything for P0.6. You'll be in Google Cloud Console and Google Drive, not your code editor.

You need: a Google account that has access to Dr. Laura's Drive folder (or your own account if Dr. Laura can share the folder with you afterward). A web browser. About 10 minutes.

At the end of this you'll have:
- A service account email address (looks like `clinical-signal-drive-watcher@<something>.iam.gserviceaccount.com`)
- A JSON key file downloaded to your computer
- The Drive folder shared with that service account email
- Two values to copy into `.env`: the path to the JSON key file, and the Drive folder ID

Don't worry about any of these terms — the steps below will make them concrete.

---

## Step 1 — Open Google Cloud Console

Go to: https://console.cloud.google.com

Sign in with the Google account you want to use for this. Probably your work email if you have one; otherwise your personal Google account is fine for now (you can move ownership later).

## Step 2 — Create a project (or pick an existing one)

At the top of the page, next to "Google Cloud," there's a project picker. Click it.

In the dialog that opens, click **"NEW PROJECT"** in the top right.

- Project name: `clinical-signal` (or pick anything you'll remember)
- Location: leave as default ("No organization" is fine)

Click **"CREATE"**. Wait 10-20 seconds. When it's done you'll see a notification; click it, then make sure the project picker at the top shows your new project name.

## Step 3 — Enable the Drive API

In the search bar at the top of the page, type: `Google Drive API`

Click the first result. You'll land on a page titled "Google Drive API."

Click the blue **"ENABLE"** button. Wait 5-10 seconds.

## Step 4 — Create a service account

In the left sidebar, click **"Credentials"** (under "APIs & Services").

If you don't see the left sidebar, click the hamburger menu (three horizontal lines) in the top-left corner.

At the top of the Credentials page, click **"+ CREATE CREDENTIALS"** → **"Service account"**.

Fill in:
- Service account name: `clinical-signal-drive-watcher`
- Service account ID: (auto-fills, leave as-is)
- Service account description: `Reads Dr. Laura's Drive folder for hourly content ingestion`

Click **"CREATE AND CONTINUE"**.

Step 2 of the wizard ("Grant this service account access to project"): **skip this** — just click **"CONTINUE"** without picking any role.

Step 3 ("Grant users access to this service account"): **skip this too** — click **"DONE"**.

You should now be back on the Credentials page, and you'll see a new row under "Service Accounts" with the email address (e.g. `clinical-signal-drive-watcher@clinical-signal-1234.iam.gserviceaccount.com`).

**Copy that email address somewhere — you'll need it in Step 6.**

## Step 5 — Generate a JSON key for the service account

On the Credentials page, click the email address of the service account you just made.

You're now on the service account's detail page. Click the **"KEYS"** tab near the top.

Click **"ADD KEY"** → **"Create new key"**.

In the popup, pick **"JSON"**, then click **"CREATE"**.

A JSON file will download to your computer automatically. It's probably in your `~/Downloads` folder. The filename looks like `clinical-signal-1234-abc123def456.json`.

**Don't lose this file. Don't share it. Don't commit it to git.** Treat it like a password.

Move it to a safe location:

```bash
mkdir -p ~/clinical-signal-main/secrets
mv ~/Downloads/clinical-signal-*.json ~/clinical-signal-main/secrets/drive-watcher-key.json
```

## Step 6 — Share the Drive folder with the service account

Open Google Drive (https://drive.google.com) in a new tab.

Navigate to **Dr. Laura's "Clinical Signal Sources" folder** (or whatever the master folder is called that contains the Certification Materials, Fellowship modules, etc.).

Right-click the folder → **"Share"**.

In the "Add people and groups" field, paste the **service account email** you copied in Step 4.

Set the permission to **"Viewer"** (read-only is correct — we never want the service account to be able to modify anything).

**Uncheck "Notify people"** (the service account isn't a real person; no notification needed).

Click **"Share"** (or **"Send"**).

## Step 7 — Get the Drive folder ID

While you're still in the Drive folder, look at the URL bar in your browser. It looks like:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
```

The long string after `/folders/` is the folder ID. **Copy it.**

## Step 8 — Save the two values to `.env`

Open `~/clinical-signal-main/.env` in your editor. Add these two lines at the bottom:

```
GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/drive-watcher-key.json
DRIVE_WATCH_FOLDER_ID=<paste-the-folder-id-from-step-7>
```

Note: the path `/app/secrets/...` is the path **inside** the Docker container, not on your laptop. The Docker setup in Phase 1 will mount your local `secrets/` folder to `/app/secrets/` inside the container, so the path inside the container is stable.

## Step 9 — Confirm `secrets/` is gitignored

Open `~/clinical-signal-main/.gitignore` in your editor. Look for a line that says `secrets/` or `secrets/*` or `*.json` in a way that would catch your key file.

If none of those are there, add this line at the top:

```
secrets/
```

Save the file.

## Step 10 — You're done with Phase 0

You should now have:

- [x] A Google Cloud project with the Drive API enabled
- [x] A service account email
- [x] A JSON key file at `~/clinical-signal-main/secrets/drive-watcher-key.json`
- [x] Dr. Laura's Drive folder shared with the service account (Viewer access)
- [x] The folder ID and the key path saved to `.env`
- [x] `secrets/` in `.gitignore`

When you tell Cowork "Phase 0 done," I'll give you the Phase 1 handoff prompt to paste into Claude Code. Phase 1 builds the database state table and the polling skeleton — about 1-2 hours of Claude Code work.

If anything in this walkthrough confused you or didn't match what you saw on screen, tell me where you got stuck and I'll fix the doc. Google Cloud Console's UI changes every few months.
