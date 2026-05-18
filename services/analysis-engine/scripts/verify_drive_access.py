"""Verify the Google service account can read the two known Drive folders.

Companion to the Phase 5 Drive watcher work. Ryan provisions a service
account in Google Cloud Console, downloads the JSON key, drops it at
infrastructure/secrets/google-service-account.json, then runs this
script. If it lists files from both folders, the auth path is good and
the Drive watcher work is unblocked.

Usage:
    GOOGLE_APPLICATION_CREDENTIALS=infrastructure/secrets/google-service-account.json \
      python scripts/verify_drive_access.py
    # or with --creds:
    python scripts/verify_drive_access.py \
      --creds infrastructure/secrets/google-service-account.json

Exit codes:
    0 — both folders listed successfully
    2 — credentials file missing
    3 — credentials invalid or insufficient scope
    4 — Drive API not enabled on the project
    5 — folder unreadable (likely not shared with the service account)
    1 — unexpected error
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# The two known folders. Hard-coded here so the verification script is
# stand-alone — Phase 5 will move these into config.
FOLDERS = [
    ("Slack Export - Mentorship", "161VCvz43IVXDGuO3M2JPZamp1K5HZCGe"),
    ("Clinical Signal Sources", "1f4PY0gvedz-FX8qouKCfARATmXKIYsFf"),
]

# Read-only scope: this script needs only listing + reading.
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def _build_service(creds_path: Path):
    """Build a Drive v3 service from a service-account key file.

    Raised exceptions are caught and translated to exit codes in main()
    so the operator gets actionable messages instead of a stack trace.
    """
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_file(
        str(creds_path), scopes=SCOPES,
    )
    # cache_discovery=False silences the noisy "file_cache is unavailable"
    # warning when running under environments without write access to
    # the default cache dir (containers, CI).
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _list_folder(service, folder_id: str) -> list[dict]:
    """List files in a Drive folder. Handles paging up to 1000 files —
    plenty for the two folders we target (currently ~33 + ~50 files)."""
    from googleapiclient.errors import HttpError

    try:
        resp = service.files().list(
            q=f"'{folder_id}' in parents and trashed = false",
            fields="files(id, name, mimeType, modifiedTime)",
            pageSize=1000,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
    except HttpError as err:
        # Translate common HTTP errors into a richer message; main()
        # picks an exit code based on the message prefix.
        status = err.resp.status if err.resp else "?"
        reason = err.error_details if err.error_details else err.reason
        if status == 403:
            raise RuntimeError(
                f"PERMISSION_DENIED listing folder {folder_id}: {reason}. "
                f"Share the folder with the service account's client_email."
            ) from err
        if status == 404:
            raise RuntimeError(
                f"NOT_FOUND folder {folder_id}: {reason}. "
                f"Confirm the folder ID and that the service account "
                f"has at least Viewer access."
            ) from err
        raise

    return resp.get("files", [])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    default_creds = os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS",
        "infrastructure/secrets/google-service-account.json",
    )
    ap.add_argument(
        "--creds", default=default_creds,
        help=f"Path to service-account JSON key (default: {default_creds})",
    )
    args = ap.parse_args()

    creds_path = Path(args.creds)
    if not creds_path.exists():
        print(
            f"ERROR: credentials file not found at {creds_path}\n"
            f"  Drop the service-account JSON key there, or pass --creds.\n"
            f"  Ryan: this should be the key downloaded from Cloud Console\n"
            f"  for the service account configured in Phase 1c.",
            file=sys.stderr,
        )
        return 2

    try:
        service = _build_service(creds_path)
    except ImportError as err:
        print(
            f"ERROR: Google client libraries not installed: {err}\n"
            f"  Install with: pip install -r services/analysis-engine/requirements.txt",
            file=sys.stderr,
        )
        return 1
    except Exception as err:
        print(
            f"ERROR: failed to build Drive service: {type(err).__name__}: {err}\n"
            f"  Likely the JSON key is malformed or the project lacks the "
            f"required scopes ({', '.join(SCOPES)}).",
            file=sys.stderr,
        )
        return 3

    all_ok = True
    for name, folder_id in FOLDERS:
        print(f"\n=== {name} ({folder_id}) ===")
        try:
            files = _list_folder(service, folder_id)
        except RuntimeError as err:
            msg = str(err)
            print(f"FAIL: {msg}", file=sys.stderr)
            if msg.startswith("PERMISSION_DENIED"):
                return 5
            if msg.startswith("NOT_FOUND"):
                return 5
            print(f"  Other HttpError — check Cloud Console logs.", file=sys.stderr)
            return 4
        except Exception as err:
            all_ok = False
            print(f"FAIL: {type(err).__name__}: {err}", file=sys.stderr)
            continue

        print(f"  file_count = {len(files)}")
        for f in files[:5]:
            print(f"  - {f.get('name')}  [{f.get('mimeType')}]")
        if len(files) > 5:
            print(f"  … and {len(files) - 5} more")

    if not all_ok:
        return 1
    print("\nOK — both Drive folders are readable. Phase 5 auth path is good.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
