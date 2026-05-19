Per Dr. Laura's feedback (May 8, 2026): document upload is time-consuming and error-prone for practitioners. Before filing fixes, run this audit against the current app to identify which capabilities work and which need work. Each broken capability becomes its own follow-up issue with concrete reproduction steps.

## Setup

Synthetic patient with at least one existing lab record. Use Chrome on macOS for the primary pass; spot-check one upload on Safari and one on iOS Safari (Dr. Laura's mobile workflow).

## Test matrix

| # | Capability | Test | Pass criteria |
|---|---|---|---|
| 1 | **Discoverability** | From the patient detail page, count clicks to start a lab upload. From the intake review page. From the protocol view page. | ≤2 clicks from any patient-context page |
| 2 | **File-type acceptance — labs** | Upload a multi-page lab PDF, an HEIC photo of a lab printout, a JPG of a lab printout, a scanned lab PDF (image-based, not text-extractable) | All accepted; if rejected, error message names the actual reason |
| 3 | **File-type acceptance — intake docs** | Upload an .m4a voice memo, an .mp3, a .docx with notes, a supplement bottle photo (HEIC and JPG), a PDF of past lab results | All accepted with clear feedback |
| 4 | **Silent failure detection** | Upload a 60MB file (over 50MB cap). Upload a corrupted PDF. Upload a file mid-session-timeout. Disconnect network mid-upload. | Each failure produces a visible, actionable error message — no silent success |
| 5 | **Batch upload** | Try to upload 5 files at once (drag-and-drop or multi-select) | Either works, or there's a clear "one at a time" affordance — not a half-broken multi-select |
| 6 | **Tagging at upload** | When uploading, can you tell the system "this is a lab" vs. "this is a transcript" vs. "this is a supplement photo"? | Yes, with sensible defaults based on context (intake page → intake doc, records page → lab) |
| 7 | **Propagation to AI context** | Upload a doc. Immediately trigger protocol generation (or prep brief). Does the new doc appear in the AI's input? | Yes, without needing a page refresh or re-trigger |
| 8 | **Mobile** | Upload a photo from iOS Safari (camera capture), upload a PDF from iOS Files | Both work; camera capture flow is one-tap |
| 9 | **Confirmation** | After successful upload, is there clear confirmation? Does the file appear in a list immediately? | Yes — visible, immediate, no refresh required |
| 10 | **Removal/correction** | Upload the wrong file. Try to remove or replace it. | Possible without contacting support |

## Output

Per-row pass/fail with a one-line note. For every fail, file a follow-up issue with: which test failed, what happened, what was expected, screenshot if applicable.

## Time estimate

30-45 min for the full audit.
