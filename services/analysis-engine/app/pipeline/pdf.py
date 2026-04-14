"""PDF text extraction. Uses PyMuPDF for text-layer PDFs and falls back to
pytesseract OCR for pages that look like scanned images."""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

log = logging.getLogger(__name__)

# Empirical threshold: pages with fewer than this many text characters on the
# extracted text layer are treated as scans and re-processed with OCR.
OCR_CHAR_THRESHOLD = 40


@dataclass
class ExtractionResult:
    text: str
    page_count: int
    ocr_pages: int  # how many pages fell back to OCR


def extract_pdf_text(path: str) -> ExtractionResult:
    doc = fitz.open(path)
    out_pages: list[str] = []
    ocr_pages = 0
    try:
        for i, page in enumerate(doc):
            txt = page.get_text("text") or ""
            if len(txt.strip()) < OCR_CHAR_THRESHOLD:
                try:
                    pix = page.get_pixmap(dpi=200)
                    img = Image.open(io.BytesIO(pix.tobytes("png")))
                    ocr_txt = pytesseract.image_to_string(img)
                    if len(ocr_txt.strip()) > len(txt.strip()):
                        txt = ocr_txt
                        ocr_pages += 1
                except Exception as ocr_err:
                    # Do not log page content — only the failure.
                    log.warning("OCR failed on page %d: %s", i, ocr_err)
            out_pages.append(txt)
    finally:
        doc.close()

    return ExtractionResult(
        text="\n\n".join(out_pages).strip(),
        page_count=len(out_pages),
        ocr_pages=ocr_pages,
    )
