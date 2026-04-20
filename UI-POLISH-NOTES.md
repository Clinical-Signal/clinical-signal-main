# UI Polish Notes

## Completed overnight (this session)

### Intake hub polish
- Document list: type-filter chips, expandable text previews, file type icons, expand chevron
- Tab indicators: full-width on mobile, smoother hover
- File upload: larger drop zone with scale transition, file type icon preview
- Token estimate shown while typing transcripts

### Prep brief polish
- Print button (window.print with print:* utilities)
- Copy to clipboard (formatted plain text)
- Collapsible/expandable sections with toggle chevrons
- "Regenerate" label after first brief generated

### Dashboard improvements
- New "Progress" column with mini pill badges for doc count, prep brief status, protocol status
- DOB moved under patient name to save horizontal space

## Deferred — protocol editor improvements

These require deeper structural changes:

- **Auto-save with debounce**: currently each save creates a new protocol version (INSERT, not UPDATE). Debounced auto-save would create version spam. Needs either: (a) a separate "save draft in place" mutation that UPDATEs the current row, reserving "Save as new version" for explicit versioning, or (b) a dirty-state persistence layer (localStorage or DB drafts table).

- **Edit/Preview toggle**: would benefit from a markdown renderer (like react-markdown) for the free-text fields (clinical_reasoning, closing_note). Without a renderer, "preview" would just show the same text without the textarea chrome — not valuable enough to justify the component complexity.

- **Version comparison (diff)**: meaningful diff between protocol versions would require a JSON-aware diff algorithm since the content is structured JSONB. A naive text diff would be noisy. Consider using json-diff or a custom section-by-section comparison UI.

## Known issues

- Protocol generation takes 90-280s total (two streaming API calls). The progress UI (Step 1/2, Step 2/2 with ping updates) is functional but the raw duration will surprise practitioners. Consider: (a) using a faster model for one step, (b) caching analyses so regeneration only needs step 2, (c) background generation with email/push notification on completion.

- Vercel Blob store was never linked for file uploads. Uploaded files are validated and recorded but the PDF bytes aren't persisted on Vercel (only locally in Docker). For production, either link the blob store interactively or switch to storing PDFs as bytea in Neon.
