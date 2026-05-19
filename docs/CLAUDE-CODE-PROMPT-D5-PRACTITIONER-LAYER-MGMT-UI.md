# Handoff prompt for Claude Code — D.5 Practitioner Layer D management UI

Paste everything below the line into a fresh Claude Code session opened in `~/clinical-signal-main`.

---

## Task: Build the practitioner-facing UI for managing their private knowledge layer

Per `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — "UI sketch" section. This is the practitioner's window into their Layer D content: upload files, see extraction status, view extracted entries, delete things.

**Depends on:** D.1, D.2, D.3 merged. D.4 (cross-layer retrieval) and C.3.3 (inline conflict surfacing) are independent — D.5 doesn't need them and can ship in parallel.

**Read first:** `docs/LAYER-D-PRACTITIONER-EXTENSIBILITY.md` — UI sketch section

## Implementation

### 1. Page: `/dashboard/knowledge/my-uploads`

New file: `apps/web/app/(dashboard)/dashboard/knowledge/my-uploads/page.tsx`

Server component, fetches the upload list via the `GET /api/practitioner/uploads` endpoint built in D.2.

Layout:

```
+------------------------------------------------------------------+
|  My uploads                                                       |
|                                                                   |
|  These files shape protocols generated for YOUR clients only.     |
|  No one else sees this content.                                   |
|  [Learn more →]                                                  |
|                                                                   |
|  +-------------------------------------+                          |
|  |  Drag files here, or click to browse |                         |
|  |  PDF · DOCX · TXT · MD · PPTX        |                         |
|  |  Max 50 MB per file                  |                         |
|  +-------------------------------------+                          |
|                                                                   |
|  Your files                                                       |
|  +----------------------------------------------------------+    |
|  | Filename                | Type | Status     | Entries | … |    |
|  |-------------------------|------|------------|---------|---|    |
|  | ProtocolTemplate-Gut.docx| docx | extracted  |   23    | ⋮ |    |
|  | Methodology-2025.pdf    | pdf  | extracting |    -    | ⋮ |    |
|  | OldNotes.txt            | txt  | failed     |    -    | ⋮ |    |
|  +----------------------------------------------------------+    |
|                                                                   |
|  Empty state (if no uploads):                                    |
|  "Upload your first file to start. Your sample protocols, methodology |
|   docs, and case notes will influence protocols generated for your    |
|   clients — without ever being shared with other practitioners."      |
+------------------------------------------------------------------+
```

Per-row actions menu (⋮):
- **View entries** → navigate to `/dashboard/knowledge/my-uploads/[uploadId]/entries`
- **Re-upload** → opens file picker; replaces this upload (creates new upload row, marks old as `'deleted'`, deletes old entries)
- **Delete** → confirmation modal, then UPDATE `upload_status='deleted'` + DELETE associated `practitioner_knowledge` rows

Status indicators:
- `uploaded` — gray badge, "Queued for extraction"
- `extracting` — yellow badge with spinner, "Processing..."
- `extracted` — green badge with entry count, "Ready"
- `failed` — red badge with tooltip showing extraction_error, "Failed — see details"
- `deleted` — not shown (filtered out by the list endpoint)

Auto-refresh: poll the list every 5 seconds while any upload is in `'uploaded'` or `'extracting'` state. Stop polling when all are settled. Use a simple `setInterval` in a client component wrapper.

### 2. Drag-and-drop upload component

New client component: `apps/web/app/(dashboard)/dashboard/knowledge/my-uploads/upload-zone.tsx`

Drag-and-drop OR click-to-browse. Accepts the file types listed. Posts to `POST /api/practitioner/uploads` (built in D.2). Shows upload progress for large files. On success, refreshes the list above.

Use the existing intake-docs upload pattern as a reference — `apps/web/app/(dashboard)/dashboard/patients/[id]/records/upload-form.tsx` is a similar shape.

### 3. Page: `/dashboard/knowledge/my-uploads/[uploadId]/entries`

New file: `apps/web/app/(dashboard)/dashboard/knowledge/my-uploads/[uploadId]/entries/page.tsx`

Lists the `practitioner_knowledge` rows extracted from this specific upload. Each row shows:
- Title
- Category
- Domain tags (chips)
- Content snippet (first 200 chars)
- Faithfulness score (if < 0.75, highlight in yellow with tooltip explaining the score)
- Per-row delete action (rare but possible — for entries the practitioner thinks are wrong extractions)

If extraction is still in progress, show a "Still processing — check back soon" message instead of the entry list.

### 4. Navigation entry

Add a sidebar nav item linking to `/dashboard/knowledge/my-uploads`. Icon: something like an upload-folder. Label: "My uploads" or "My knowledge."

Find the sidebar nav in the dashboard layout — probably `apps/web/app/(dashboard)/dashboard/layout.tsx` or a separate nav component.

### 5. Helper functions in `lib/practitioner-knowledge.ts` (extend D.2's file)

```typescript
export async function deleteUpload(
  tenantId: string,
  practitionerId: string,
  uploadId: string,
): Promise<void> {
  // Soft-delete the upload, hard-delete the extracted entries
  return withTenant(tenantId, async (c) => {
    // Verify ownership first
    const { rows } = await c.query<{ id: string }>(
      `SELECT id FROM practitioner_uploads
        WHERE id = $1 AND practitioner_id = $2`,
      [uploadId, practitionerId],
    );
    if (rows.length === 0) throw new Error("Upload not found.");

    await c.query(
      `UPDATE practitioner_uploads
          SET upload_status = 'deleted'
        WHERE id = $1`,
      [uploadId],
    );
    await c.query(
      `DELETE FROM practitioner_knowledge WHERE upload_id = $1`,
      [uploadId],
    );
  });
}

export async function getUploadEntries(
  tenantId: string,
  practitionerId: string,
  uploadId: string,
): Promise<PractitionerKnowledgeEntry[]> {
  return withTenant(tenantId, async (c) => {
    const { rows } = await c.query<PractitionerKnowledgeEntry>(
      `SELECT pk.id, pk.title, pk.category, pk.content, pk.domains,
              pk.faithfulness_score, pk.faithfulness_notes, pk.created_at
         FROM practitioner_knowledge pk
         JOIN practitioner_uploads pu ON pu.id = pk.upload_id
        WHERE pk.upload_id = $1
          AND pu.practitioner_id = $2
        ORDER BY pk.created_at`,
      [uploadId, practitionerId],
    );
    return rows;
  });
}

export async function deleteEntry(
  tenantId: string,
  practitionerId: string,
  entryId: string,
): Promise<void> {
  return withTenant(tenantId, async (c) => {
    await c.query(
      `DELETE FROM practitioner_knowledge pk
         USING practitioner_uploads pu
        WHERE pk.id = $1
          AND pk.upload_id = pu.id
          AND pu.practitioner_id = $2`,
      [entryId, practitionerId],
    );
  });
}
```

### 6. API routes for delete and entry list

- `DELETE /api/practitioner/uploads/[uploadId]` — calls `deleteUpload`
- `GET /api/practitioner/uploads/[uploadId]/entries` — calls `getUploadEntries`
- `DELETE /api/practitioner/entries/[entryId]` — calls `deleteEntry`

All scoped to the authenticated practitioner via `apiAuth` + ownership check in the lib functions.

## Hard constraints

- **Practitioner can only see/manage their own uploads and entries.** Ownership check at every API call. Never trust the URL parameter to identify the practitioner — always use `user.practitionerId` from `apiAuth`.
- **Delete is destructive.** No soft-delete-with-restore for entries (just for uploads, to preserve audit). Confirmation modal for any delete action.
- **Empty state copy emphasizes privacy.** "Your sample protocols ... will influence protocols generated for your clients — without ever being shared with other practitioners." This is the moat message; reinforce it in the UI.
- **Don't try to do anything fancy.** No content preview rendering (just plain text snippets), no semantic search within entries, no bulk operations. Per design doc — start simple, iterate later.
- **Match existing UI conventions.** Sidebar nav, page layout, button styles — use whatever the existing dashboard pages use.
- **Branch:** `feat/d5-practitioner-layer-mgmt-ui`. Draft PR. Don't merge.

## Verification

1. `npx tsc --noEmit` passes
2. `npm run build` succeeds
3. Manual test in dev:
   - Navigate to `/dashboard/knowledge/my-uploads` — empty state shows
   - Upload a PDF via drag-and-drop — appears in list with `uploaded` status
   - Wait — status progresses to `extracting` then `extracted` (auto-refresh works)
   - Click "View entries" — see the extracted entries from D.3
   - Try delete on one entry — confirmation modal, then it disappears from the list
   - Try delete on the whole upload — confirmation modal, then it disappears
   - Verify in DB: upload row has `upload_status='deleted'`, all associated entries removed
4. Cross-practitioner privacy test: as Practitioner B, navigate to `/dashboard/knowledge/my-uploads` — should NOT see Practitioner A's uploads
5. Try to manipulate URLs: `/dashboard/knowledge/my-uploads/<other-practitioner-uploadId>/entries` — should 404

## Deliverable

- New: `apps/web/app/(dashboard)/dashboard/knowledge/my-uploads/page.tsx`
- New: `apps/web/app/(dashboard)/dashboard/knowledge/my-uploads/upload-zone.tsx` (client component)
- New: `apps/web/app/(dashboard)/dashboard/knowledge/my-uploads/[uploadId]/entries/page.tsx`
- New: API routes for delete + entry list
- Modified: `apps/web/lib/practitioner-knowledge.ts` — adds the management helper functions
- Modified: dashboard sidebar nav — adds "My uploads" link
- Draft PR titled "D.5 — Practitioner Layer D management UI"
- PR body: verification output + a screenshot or two of the UI in action

When done, paste the PR URL. With D.5 merged, Layer D is functionally complete. C.3.3 (inline conflict surfacing in the protocol editor) is the last piece to make the moat fully operational.
