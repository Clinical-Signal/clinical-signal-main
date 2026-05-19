# Handoff prompt for Claude Code — A.3.3 Magic byte validation on intake document uploads

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Add magic byte validation to intake document uploads

Per `docs/INVESTIGATION-LAYER-A3-SECURITY-GAPS.md` — labs (`lib/records.ts`) already check magic bytes correctly. Intake document uploads (`apps/web/app/api/patients/[id]/intake-docs/route.ts`) only check filename extension. A malicious user could rename any file with a permitted extension and the system would accept it.

## Implementation

In `apps/web/app/api/patients/[id]/intake-docs/route.ts`, the FormData branch (around lines 80-110) already classifies by filename:

```typescript
const name = file.name.toLowerCase();
const bytes = Buffer.from(await file.arrayBuffer());
let extractedText = "";
let docType: "pdf" | "docx" | "txt" | "image" = "txt";

if (name.endsWith(".pdf")) {
  docType = "pdf";
  extractedText = "(PDF text extracted client-side)";
} else if (name.endsWith(".docx")) {
  ...
} else if (name.endsWith(".txt") || name.endsWith(".vtt") || name.endsWith(".srt")) {
  ...
} else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
  ...
}
```

After classification, add a magic byte check that the file's actual content matches the claimed extension. Reject with a clear error if it doesn't.

### Magic bytes per accepted type

```typescript
function validateMagicBytes(bytes: Buffer, claimedType: "pdf" | "docx" | "txt" | "image", filename: string): void {
  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (claimedType === "pdf") {
    if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error(`File "${filename}" has a .pdf extension but isn't a valid PDF.`);
    }
    return;
  }

  // DOCX: PK\x03\x04 (it's a zip — 0x50 0x4B 0x03 0x04)
  if (claimedType === "docx") {
    if (
      bytes[0] !== 0x50 ||
      bytes[1] !== 0x4b ||
      bytes[2] !== 0x03 ||
      bytes[3] !== 0x04
    ) {
      throw new Error(`File "${filename}" has a .docx extension but isn't a valid Word document.`);
    }
    return;
  }

  // Images:
  if (claimedType === "image") {
    const lower = filename.toLowerCase();
    // JPG: FF D8 FF
    if ((lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
        !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
      throw new Error(`File "${filename}" has a JPG extension but isn't a valid JPG.`);
    }
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (lower.endsWith(".png") &&
        !(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
          bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a)) {
      throw new Error(`File "${filename}" has a PNG extension but isn't a valid PNG.`);
    }
    // GIF: GIF87a or GIF89a
    if (lower.endsWith(".gif") &&
        bytes.subarray(0, 6).toString("ascii") !== "GIF87a" &&
        bytes.subarray(0, 6).toString("ascii") !== "GIF89a") {
      throw new Error(`File "${filename}" has a GIF extension but isn't a valid GIF.`);
    }
    // WEBP: RIFF....WEBP (bytes 0-3 = "RIFF", bytes 8-11 = "WEBP")
    if (lower.endsWith(".webp") &&
        !(bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
          bytes.subarray(8, 12).toString("ascii") === "WEBP")) {
      throw new Error(`File "${filename}" has a WEBP extension but isn't a valid WEBP.`);
    }
    return;
  }

  // TXT/VTT/SRT: text-only. Validate via UTF-8 decode — non-text content will produce
  // many replacement chars or invalid sequences. Heuristic: > 5% non-printable chars
  // outside common whitespace = reject.
  if (claimedType === "txt") {
    const text = bytes.toString("utf-8");
    let nonPrintable = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 0xfffd) { nonPrintable++; continue; } // replacement char
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) nonPrintable++;
    }
    if (text.length > 0 && nonPrintable / text.length > 0.05) {
      throw new Error(`File "${filename}" has a text extension but appears to be binary content.`);
    }
    return;
  }
}
```

Call it right after the classification block, before `insertDocument`:

```typescript
try {
  validateMagicBytes(bytes, docType, file.name);
} catch (err) {
  return apiError(ERROR_CODES.VALIDATION_ERROR, 400, err);
}
```

The existing `apiError` will log server-side and return the validation error code to the client.

## Hard constraints

- **Reuse the lab pattern.** `lib/records.ts:152` already does `bytes.subarray(0, 4).toString("ascii") !== "%PDF"` for PDFs. Match the same style.
- **Reject, don't warn.** A magic-byte mismatch is a clear rejection — don't try to recover or fall through.
- **Error message names the actual reason.** Per A.3.3 in the prioritization doc: error messages should name the specific cause ("file isn't a valid PDF") not just "validation failed."
- **No PHI in error messages.** Filenames are okay (practitioner uploaded them), file contents are not.
- **Branch:** `feat/a33-intake-docs-magic-bytes`. Draft PR. Don't merge.

## Verification

1. `npx tsc --noEmit` passes
2. Manual test (use the dev environment):
   - Upload a real PDF as an intake doc → accepted
   - Rename a real PNG to `.pdf` and upload → rejected with the PDF error message
   - Upload a real DOCX → accepted
   - Rename a real PDF to `.docx` and upload → rejected with the DOCX error message
   - Upload a real JPG → accepted
   - Upload an actual binary file (e.g., the Python interpreter) renamed to `.txt` → rejected with the binary-content error
3. Existing intake doc uploads still work end-to-end (regression check)

## Deliverable

- Modified `apps/web/app/api/patients/[id]/intake-docs/route.ts` — adds the validateMagicBytes function and the call site
- Optional: extract `validateMagicBytes` into a shared helper if you find the lab side could also benefit (lib/records.ts currently has its own inline PDF check — could consolidate if it's clean)
- Draft PR titled "A.3.3 — Magic byte validation on intake document uploads" with verification output

When done, paste the PR URL.
