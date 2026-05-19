# Handoff prompt for Claude Code — D.2 Practitioner upload endpoint + S3 storage

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: API endpoint and S3 storage for practitioner-uploaded methodology / sample protocol files

Per `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md`. This is the upload surface for the per-practitioner private knowledge layer (Layer D). After this lands, D.3 (extraction pipeline) processes the uploaded files into knowledge entries.

**Depends on:** D.1 (`practitioner_uploads` table) merged. Verify before starting.

**Read first:** `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — "Upload flow" section.

## Implementation

### 1. New API route

`apps/web/app/api/practitioner/uploads/route.ts` — POST handler for multipart/form-data file uploads.

Pattern: same shape as `apps/web/app/api/patients/[id]/intake-docs/route.ts` (the existing intake-docs upload). Differences:

- **No patient_id in URL** — this is practitioner-scoped, not patient-scoped. URL is `/api/practitioner/uploads`, not `/api/patients/[id]/...`.
- **Uses `user.practitionerId` for ownership** — written into both `practitioner_uploads.practitioner_id` and the S3 key path.
- **Accepts more file types than intake-docs** — practitioners might upload DOCX methodology, PDF sample protocols, plain text notes, even Markdown. Per the design doc: pdf, docx, txt, md, pptx, other (rejection-list rather than allow-list-only — practitioner content is more permissive than patient content).
- **No PHI in this surface** — practitioners upload their own methodology, not patient data. So PHI handling rules are looser, but standard upload validation (size, magic bytes per A.3.3 pattern) still applies.

Skeleton:

```typescript
import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { uploadPractitionerFile } from "@/lib/practitioner-knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) {
      return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const result = await uploadPractitionerFile({
      tenantId: user.tenantId,
      practitionerId: user.practitionerId,
      file,
    });

    return NextResponse.json(result);
  } catch (err) {
    return apiError(ERROR_CODES.UPLOAD_FAILED, 500, err);
  }
}

export async function GET(_req: Request) {
  // List uploads for the current practitioner — used by D.5 management UI
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);

    const uploads = await listPractitionerUploads(user.tenantId, user.practitionerId);
    return NextResponse.json(uploads);
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
```

### 2. New library file

`apps/web/lib/practitioner-knowledge.ts` — encapsulates the upload logic.

```typescript
import { withTenant } from "./db";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
// (S3 SDK import will be added when Layer A.2.1 lands; for now use the existing
// IS_VERCEL/UPLOADS_DIR pattern from lib/records.ts)

const MAX_PRACTITIONER_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB — match labs
const ALLOWED_TYPES = new Set(["pdf", "docx", "txt", "md", "pptx"]);

export interface PractitionerUploadResult {
  uploadId: string;
  status: "uploaded";
}

export async function uploadPractitionerFile(args: {
  tenantId: string;
  practitionerId: string;
  file: File;
}): Promise<PractitionerUploadResult> {
  const { tenantId, practitionerId, file } = args;

  // 1. Size check
  if (file.size <= 0) throw new Error("File is empty.");
  if (file.size > MAX_PRACTITIONER_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${Math.floor(MAX_PRACTITIONER_UPLOAD_BYTES / 1024 / 1024)} MB limit.`);
  }

  // 2. Type check by extension + magic bytes (reuse the magic-byte approach from
  //    the A.3.3 fix to intake-docs — copy or extract to a shared helper)
  const filename = file.name;
  const ext = path.extname(filename).slice(1).toLowerCase();
  if (!ALLOWED_TYPES.has(ext)) {
    throw new Error(`File type ".${ext}" is not allowed. Accepted: ${Array.from(ALLOWED_TYPES).join(", ")}.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Magic byte validation per type (same logic as A.3.3 intake-docs fix)
  validateMagicBytes(bytes, ext, filename);

  // 3. Insert row + write file
  const uploadId = randomUUID();
  const s3Key = `practitioner-uploads/${tenantId}/${practitionerId}/${uploadId}.${ext}`;

  // Local dev: write to UPLOADS_DIR (same pattern as lib/records.ts)
  const UPLOADS_DIR = process.env.UPLOADS_DIR ?? "/uploads";
  await mkdir(path.join(UPLOADS_DIR, path.dirname(s3Key)), { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, s3Key), bytes, { mode: 0o600 });

  // (TODO when Layer A.2.1 ships: replace local writeFile with S3 PutObject)

  await withTenant(tenantId, async (c) => {
    await c.query(
      `INSERT INTO practitioner_uploads
         (id, tenant_id, practitioner_id, original_filename, file_type, s3_key, file_size_bytes, upload_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploaded')`,
      [uploadId, tenantId, practitionerId, filename, ext, s3Key, file.size],
    );
  });

  // 4. (Out of scope for D.2 — D.3 will handle extraction trigger.
  //    For D.2, we just store the file and the upload row. D.3 wires the post-upload extraction.)

  return { uploadId, status: "uploaded" };
}

export async function listPractitionerUploads(
  tenantId: string,
  practitionerId: string,
): Promise<PractitionerUpload[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<PractitionerUpload>(
      `SELECT id, original_filename, file_type, upload_status, file_size_bytes,
              extraction_error, uploaded_at, extracted_at
         FROM practitioner_uploads
        WHERE practitioner_id = $1
          AND upload_status != 'deleted'
        ORDER BY uploaded_at DESC`,
      [practitionerId],
    );
    return rows;
  });
}

export interface PractitionerUpload {
  id: string;
  original_filename: string;
  file_type: string;
  upload_status: "uploaded" | "extracting" | "extracted" | "failed" | "deleted";
  file_size_bytes: number;
  extraction_error: string | null;
  uploaded_at: Date;
  extracted_at: Date | null;
}

// validateMagicBytes — same logic as A.3.3 fix; share if A.3.3 has merged
function validateMagicBytes(bytes: Buffer, claimedType: string, filename: string): void {
  // (See docs/CLAUDE-CODE-PROMPT-A33-INTAKE-DOCS-MAGIC-BYTES.md for the full implementation.
  //  If A.3.3 merged and exported the function, import it instead.)
}
```

If A.3.3 (`feat/a33-intake-docs-magic-bytes`) has already merged and exported `validateMagicBytes`, import it. If not, copy the function inline; refactor to a shared helper later.

## Hard constraints

- **No PHI handling complications.** Practitioner-uploaded methodology files are NOT patient data. RLS scoping by `tenant_id` is sufficient; no extra encryption beyond what S3-at-rest provides (per A.1.2).
- **File path includes both tenant_id AND practitioner_id.** `practitioner-uploads/<tenant_id>/<practitioner_id>/<upload_id>.<ext>` — defends against any hypothetical S3-key-collision attack and makes audit easy.
- **Don't trigger extraction in this PR.** D.3 wires the extraction pipeline. D.2 just stores the file and creates the upload row. Status stays at `'uploaded'` until D.3 picks it up.
- **Match existing patterns.** Use `withTenant` for the DB write, `apiAuth` for auth, `apiError` for error responses.
- **Branch:** `feat/d2-practitioner-upload-endpoint`. Draft PR. Don't merge.

## Verification

1. `npx tsc --noEmit` passes
2. Apply (D.1 must already be merged — `practitioner_uploads` table must exist)
3. Manual test via `curl` or via a tiny test page:

```bash
# As an authenticated practitioner (use a real session cookie)
curl -X POST http://localhost:3000/api/practitioner/uploads \
  -H "Cookie: <session-cookie>" \
  -F "file=@/path/to/test-protocol.pdf"
# Should return: {"uploadId": "...", "status": "uploaded"}

# Verify row in DB:
docker compose exec -T postgres psql -U clinical_signal -d clinical_signal \
  -c "SELECT id, original_filename, upload_status FROM practitioner_uploads ORDER BY uploaded_at DESC LIMIT 1;"

# Verify file on disk:
ls -la /uploads/practitioner-uploads/<tenant_id>/<practitioner_id>/
```

4. Test rejections:
   - Empty file → 400 VALIDATION_ERROR
   - 60 MB file → 400 with size limit message
   - Disallowed type (e.g. .exe) → 400 with type message
   - Renamed file (e.g. .png renamed to .pdf) → 400 magic byte mismatch

5. Test list endpoint:
```bash
curl http://localhost:3000/api/practitioner/uploads -H "Cookie: <session-cookie>"
# Should return JSON array including the upload from step 3
```

## Deliverable

- New: `apps/web/app/api/practitioner/uploads/route.ts`
- New: `apps/web/lib/practitioner-knowledge.ts`
- Draft PR titled "D.2 — Practitioner upload endpoint + S3 storage" with verification output

When done, paste the PR URL. After this merges, D.3 (extraction pipeline) is unblocked.
