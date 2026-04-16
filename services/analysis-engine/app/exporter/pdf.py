"""ReportLab PDF rendering for protocol exports.

Two layouts:
  * render_clinical_pdf — practitioner copy. Includes mechanisms, dosages,
    clinical reasoning, and the areas-of-uncertainty block.
  * render_client_pdf — patient copy. Phase-by-phase plain-language plan
    with desired outcomes; deliberately strips any internal _generation
    metadata.

Both produce PDF bytes. No file I/O here; the caller decides where to put
the bytes.
"""
from __future__ import annotations

import io
from typing import Any

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


# ---------------------------------------------------------------------------
# Styles — aligned with the web app design tokens. Warm stone greys (not
# pure black on white) and a muted teal accent.
# ---------------------------------------------------------------------------
_BASE = getSampleStyleSheet()
INK = HexColor("#1c1917")        # stone-900
MUTED = HexColor("#78716c")      # stone-500
SUBTLE = HexColor("#a8a29e")     # stone-400
RULE = HexColor("#e7e5e4")       # stone-200
ACCENT = HexColor("#0f4c47")     # matches --color-accent in globals.css

H1 = ParagraphStyle(
    "h1", parent=_BASE["Heading1"], fontSize=20, leading=24,
    textColor=INK, spaceAfter=2,
    fontName="Times-Roman",
)
H2 = ParagraphStyle(
    "h2", parent=_BASE["Heading2"], fontSize=11, leading=14,
    textColor=MUTED, spaceBefore=14, spaceAfter=6,
    fontName="Helvetica-Bold",
)
H3 = ParagraphStyle(
    "h3", parent=_BASE["Heading3"], fontSize=10, leading=13,
    textColor=INK, spaceBefore=6, spaceAfter=2,
    fontName="Helvetica-Bold",
)
BODY = ParagraphStyle(
    "body", parent=_BASE["BodyText"], fontSize=10, leading=14.5,
    textColor=INK, alignment=TA_LEFT, spaceAfter=4,
    fontName="Helvetica",
)
META = ParagraphStyle(
    "meta", parent=_BASE["BodyText"], fontSize=9, leading=12,
    textColor=MUTED, spaceAfter=2,
    fontName="Helvetica",
)
EYEBROW = ParagraphStyle(
    "eyebrow", parent=_BASE["BodyText"], fontSize=8, leading=10,
    textColor=MUTED, spaceAfter=4,
    fontName="Helvetica-Bold",
)
META_RIGHT = ParagraphStyle(
    "meta-right", parent=META, alignment=2,  # right
)
SECTION_LABEL = ParagraphStyle(
    "label", parent=BODY, fontSize=8, textColor=MUTED, spaceAfter=2,
    fontName="Helvetica-Bold",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _esc(text: Any) -> str:
    """ReportLab Paragraph parses a small XML subset. Escape user content."""
    if text is None:
        return ""
    s = str(text)
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _bullets(items: list[Any]) -> ListFlowable | None:
    if not items:
        return None
    flowables = [
        ListItem(Paragraph(_esc(i), BODY), leftIndent=10) for i in items if i
    ]
    if not flowables:
        return None
    return ListFlowable(flowables, bulletType="bullet", leftIndent=14, bulletFontSize=8)


def _para(style: ParagraphStyle, text: Any):
    return Paragraph(_esc(text), style)


def _header(story: list, practice: str, audience: str, patient_name: str | None,
            title: str, generated_at: str | None):
    """Letterhead block: practice on the left, date on the right, followed
    by eyebrow, title, and a thin rule. Keeps its own spacing so pages
    with page-breaks don't end up with stranded rules.
    """
    # Letterhead row — practice left, generated date right, in a 2-col table.
    date_str = generated_at or ""
    if date_str:
        # Prefer a clean "Month D, YYYY" format for the date right side.
        try:
            from datetime import datetime
            dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            date_str = dt.strftime("%B %-d, %Y")
        except Exception:
            pass
    letterhead = Table(
        [[Paragraph(_esc(practice), META), Paragraph(_esc(date_str), META_RIGHT)]],
        colWidths=["*", "*"],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ]),
    )
    story.append(letterhead)
    story.append(HRFlowable(width="100%", color=RULE, spaceBefore=6, spaceAfter=14, thickness=0.5))

    story.append(_para(EYEBROW, audience.upper()))
    story.append(_para(H1, title))
    if patient_name:
        story.append(_para(META, f"Prepared for {_esc(patient_name)}"))
    story.append(Spacer(1, 10))


def _footer(canvas, doc):
    """Page number footer. Called by SimpleDocTemplate per page."""
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    page_w, _ = doc.pagesize
    canvas.drawRightString(page_w - 0.8 * inch, 0.45 * inch, f"Page {doc.page}")
    canvas.drawString(0.8 * inch, 0.45 * inch, "Clinical Signal")
    canvas.restoreState()


def _build(story: list[Any]) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=LETTER,
        leftMargin=0.9 * inch,
        rightMargin=0.9 * inch,
        topMargin=0.8 * inch,
        bottomMargin=0.8 * inch,
        title="Clinical Protocol",
        author="Clinical Signal",
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Output A — clinical
# ---------------------------------------------------------------------------

def render_clinical_pdf(
    *,
    practice_name: str,
    patient_name: str | None,
    protocol_title: str,
    clinical_content: dict,
    generated_at: str | None = None,
) -> bytes:
    cc = clinical_content or {}
    story: list[Any] = []
    _header(
        story,
        practice=practice_name,
        audience="Clinical Protocol — practitioner copy",
        patient_name=patient_name,
        title=protocol_title or "Clinical Protocol",
        generated_at=generated_at,
    )

    if cc.get("summary_of_findings"):
        story.append(_para(H2, "Summary of findings"))
        story.append(_para(BODY, cc["summary_of_findings"]))

    sa = cc.get("systems_analysis") or []
    if sa:
        story.append(_para(H2, "Systems analysis"))
        for s in sa:
            if not isinstance(s, dict):
                continue
            sys = s.get("system") or "System"
            story.append(_para(H3, sys))
            if s.get("finding"):
                story.append(_para(BODY, f"<b>Finding:</b> {_esc(s['finding'])}"))
            if s.get("connects_to"):
                story.append(_para(BODY,
                    f"<b>Connects to:</b> {_esc(', '.join(s['connects_to']))}"))

    diet = cc.get("dietary_recommendations") or []
    if diet:
        story.append(_para(H2, "Dietary recommendations"))
        for d in diet:
            if not isinstance(d, dict):
                continue
            line = f"<b>[{_esc(d.get('priority', '—'))}]</b> {_esc(d.get('recommendation', ''))}"
            story.append(_para(BODY, line))
            if d.get("rationale"):
                story.append(_para(META, f"Rationale: {_esc(d['rationale'])}"))

    supps = cc.get("supplement_protocol") or []
    if supps:
        story.append(_para(H2, "Supplement protocol"))
        for sup in supps:
            if not isinstance(sup, dict):
                continue
            head = f"<b>{_esc(sup.get('name', '—'))}</b>"
            sub = " · ".join(
                _esc(x) for x in [sup.get("dosage"), sup.get("timing"), sup.get("duration")]
                if x
            )
            story.append(_para(H3, head))
            if sub:
                story.append(_para(META, sub))
            if sup.get("rationale"):
                story.append(_para(BODY, f"<b>Rationale:</b> {_esc(sup['rationale'])}"))
            if sup.get("cautions"):
                story.append(_para(BODY, f"<b>Cautions:</b> {_esc(sup['cautions'])}"))

    life = cc.get("lifestyle_modifications") or []
    if life:
        story.append(_para(H2, "Lifestyle modifications"))
        for l in life:
            if not isinstance(l, dict):
                continue
            story.append(_para(BODY,
                f"<b>[{_esc(l.get('priority', '—'))}]</b> {_esc(l.get('modification', ''))}"))
            if l.get("rationale"):
                story.append(_para(META, f"Rationale: {_esc(l['rationale'])}"))

    rt = cc.get("lab_retesting") or []
    if rt:
        story.append(_para(H2, "Lab re-testing"))
        for r in rt:
            if not isinstance(r, dict):
                continue
            head = f"<b>{_esc(r.get('test', ''))}</b>"
            if r.get("timing"):
                head += f" — {_esc(r['timing'])}"
            story.append(_para(BODY, head))
            if r.get("rationale"):
                story.append(_para(META, _esc(r["rationale"])))

    fu = cc.get("follow_up_timeline") or []
    if fu:
        story.append(_para(H2, "Follow-up timeline"))
        for f in fu:
            if not isinstance(f, dict):
                continue
            head = f"<b>{_esc(f.get('milestone', ''))}</b>"
            story.append(_para(BODY, head))
            if f.get("focus"):
                story.append(_para(META, _esc(f["focus"])))

    if cc.get("clinical_reasoning"):
        story.append(_para(H2, "Clinical reasoning"))
        for para in str(cc["clinical_reasoning"]).split("\n\n"):
            if para.strip():
                story.append(_para(BODY, para))

    aou = cc.get("areas_of_uncertainty") or []
    if aou:
        story.append(_para(H2, "Areas of uncertainty"))
        for u in aou:
            if not isinstance(u, dict):
                continue
            story.append(_para(H3, u.get("issue") or "Uncertainty"))
            if u.get("recommended_evaluation"):
                story.append(_para(BODY,
                    f"<b>Recommended evaluation:</b> {_esc(u['recommended_evaluation'])}"))
            if u.get("impact_if_wrong"):
                story.append(_para(META, f"Impact if wrong: {_esc(u['impact_if_wrong'])}"))

    return _build(story)


# ---------------------------------------------------------------------------
# Output B — client
# ---------------------------------------------------------------------------

def render_client_pdf(
    *,
    practice_name: str,
    patient_name: str | None,
    protocol_title: str,
    client_content: dict,
    generated_at: str | None = None,
) -> bytes:
    cc = client_content or {}
    story: list[Any] = []
    _header(
        story,
        practice=practice_name,
        audience="Your Action Plan",
        patient_name=patient_name,
        title=protocol_title or "Your Action Plan",
        generated_at=generated_at,
    )

    if cc.get("intro"):
        story.append(_para(BODY, cc["intro"]))
        story.append(Spacer(1, 6))

    phases = cc.get("phases") or []
    for ph in phases:
        if not isinstance(ph, dict):
            continue
        phase_block: list[Any] = []
        head = ph.get("title") or f"Phase {ph.get('phase', '')}"
        weeks = ph.get("weeks")
        phase_block.append(_para(H2, _esc(head)))
        if weeks:
            phase_block.append(_para(META, _esc(weeks)))
        if ph.get("why_this_comes_first"):
            phase_block.append(_para(BODY, ph["why_this_comes_first"]))

        if ph.get("what_to_start"):
            phase_block.append(_para(H3, "What to start"))
            for item in ph["what_to_start"]:
                if isinstance(item, dict):
                    line = f"<b>{_esc(item.get('action', ''))}</b>"
                    phase_block.append(_para(BODY, line))
                    if item.get("how_it_helps"):
                        phase_block.append(_para(META, _esc(item["how_it_helps"])))
                else:
                    phase_block.append(_para(BODY, _esc(item)))

        if ph.get("what_to_continue"):
            phase_block.append(_para(H3, "What to continue"))
            b = _bullets(ph["what_to_continue"])
            if b:
                phase_block.append(b)

        if ph.get("desired_outcomes"):
            phase_block.append(_para(H3, "What you can expect"))
            b = _bullets(ph["desired_outcomes"])
            if b:
                phase_block.append(b)

        if ph.get("how_youll_know_its_working"):
            phase_block.append(_para(H3, "How you'll know it's working"))
            b = _bullets(ph["how_youll_know_its_working"])
            if b:
                phase_block.append(b)

        # Try to keep the phase header + first content together; long phases
        # will still break naturally.
        story.append(KeepTogether(phase_block[:3]))
        story.extend(phase_block[3:])
        story.append(Spacer(1, 8))

    if cc.get("closing_note"):
        story.append(_para(H2, "A note from your practitioner"))
        story.append(_para(BODY, cc["closing_note"]))

    if cc.get("if_something_feels_off"):
        story.append(_para(H2, "If something feels off"))
        b = _bullets(cc["if_something_feels_off"])
        if b:
            story.append(b)

    return _build(story)
