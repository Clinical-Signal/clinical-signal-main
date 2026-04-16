# UI Polish Notes — sprint-5/ui-polish

Running log of things discovered during the UI polish pass that are
out-of-scope for this branch. Each entry is a standalone note — pick and
prioritize from the morning review.

## Bugs found but not fixed (scope: polish-only)

- **Tailwind `@apply` with CSS-var custom colors fails.** Can't use
  `@apply border-line` in globals.css because Tailwind can't resolve
  runtime CSS vars during the `@apply` expansion phase. Removed the
  `.card` and `.divider` `@apply` shortcuts; all components use inline
  Tailwind utilities directly instead. Not a real limitation — the
  component kit doesn't need `@apply` shortcuts.

## Deeper redesigns deferred

- **Login page landing graphic.** Auth layout currently has just the
  wordmark + tagline + form. A half-screen illustration or testimonial
  panel (common in clinical SaaS) would elevate the first impression but
  requires a design asset we don't have.

- **Mobile navigation.** The sticky header collapses gracefully at 390px
  but there's no hamburger or bottom nav for mobile. Desktop-first per the
  spec, but if Dr. Laura ever checks on her phone it'll feel flat.

- **Protocol editor rich text.** Per-field textarea editing preserves the
  JSONB schema (which the PDF exporter and knowledge graph depend on), but
  a practitioner might expect inline formatting (bold, lists) in the
  clinical-reasoning or closing-note fields. That needs a lightweight
  editor (Tiptap or similar) plus a serialization strategy — deeper than
  polish scope.

- **Lab review "Add row" button.** The review table lets practitioners
  delete and edit rows but has no way to add a row the AI missed. Would
  need a small addition to review-table.tsx (not a restyle).

## Notable decisions

- **Palette: stone, not slate.** Stone-50 canvas (#fafaf9) is warmer than
  slate-50 (#f8fafc). Clinical environments tend warmer — the cool blue
  cast of slate reads as "developer theme" to non-technical users.

- **Serif display font: Fraunces.** Google Font, variable, loaded via
  `next/font` (self-hosted at build). Used only for H1/H2 display — body
  and UI stay on Inter. The serif signals "professional" without competing
  with the data-dense UI.

- **StatusDot instead of Badge in dense lists.** The patient list and
  records list use a 6px dot + text label instead of a rounded pill badge.
  Badges are reserved for headers and protocol-status contexts where
  the state deserves more visual weight.

- **"Unsaved changes" pill in protocol editor.** Computed from a JSON
  snapshot diff (initial vs current). Adds a `beforeunload` listener so
  the browser confirms before navigating away. Calm warning-soft tint,
  not an alarming red alert.

- **PDF letterhead.** Practice name left-aligned, formatted date
  right-aligned in a 2-col table. Uppercase eyebrow for the audience
  ("CLINICAL PROTOCOL — PRACTITIONER COPY"). "Prepared for <name>".
  Page footer: "Clinical Signal" left, "Page N" right.
