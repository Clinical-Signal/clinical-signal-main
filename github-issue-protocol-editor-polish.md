# Sprint 4.3: Protocol Editor Polish

## Context
The protocol editor already has: side-by-side clinical protocol + client action plan editing, structured field editing for all sections, version management (save as new version), status workflow (draft → review → finalized), regenerate button, and unsaved changes warning.

## What's Missing for Dr. Laura's Testing

### Sub-task 1: Auto-save with debounce
- [ ] Add 30-second debounced auto-save that saves edits to localStorage
- [ ] On page load, check for unsaved localStorage edits and offer to restore
- [ ] Show a subtle "Auto-saved" indicator in the toolbar
- [ ] Clear localStorage on successful server save

### Sub-task 2: Markdown preview toggle
- [ ] Add a "Preview / Edit" toggle button to each panel (clinical + client)
- [ ] In preview mode, render the protocol content as formatted HTML (headings, bullet lists, bold)
- [ ] Use a simple markdown-to-HTML renderer (no external dependency — just basic formatting)
- [ ] Preview should match the PDF export styling as closely as possible

### Sub-task 3: Section navigation sidebar
- [ ] Add a sticky left sidebar (or top jump-links on mobile) listing all protocol sections
- [ ] Clicking a section scrolls to it
- [ ] Highlight the currently visible section as user scrolls
- [ ] Show section completeness (filled vs empty) with a visual indicator

### Sub-task 4: Inline section reordering
- [ ] Allow drag-and-drop reordering of items within lists (supplements, lifestyle mods, etc.)
- [ ] Use native HTML5 drag-and-drop (no external library)
- [ ] Show visual feedback during drag

### Sub-task 5: PDF preview from edit view
- [ ] Add a "Preview PDF" button that opens the export endpoint in a new tab
- [ ] Add both Clinical PDF and Client PDF preview buttons
- [ ] These already exist on the view page — just wire them into the edit toolbar

## Technical Notes
- All changes are in `apps/web/app/(dashboard)/dashboard/patients/[id]/protocol/[protocolId]/edit/`
- The `edit-form.tsx` component is the main file (~680 lines)
- Server actions are in `actions.ts`
- Use the existing design system components (Button, Badge, etc.)
- Keep the same Tailwind classes and color conventions
- For localStorage auto-save, key by `protocol-draft-{protocolId}`

## Acceptance Criteria
- [ ] Auto-save works — edits survive accidental page close
- [ ] Preview mode renders protocol sections as readable formatted text
- [ ] Can navigate between sections without scrolling through entire page
- [ ] PDF preview buttons work from the edit view
- [ ] All existing functionality still works (save, status change, version switch, regenerate)
- [ ] No TypeScript errors, no console warnings
