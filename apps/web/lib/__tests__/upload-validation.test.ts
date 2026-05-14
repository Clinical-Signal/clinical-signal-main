/**
 * Unit tests for the magic-byte upload validator.
 *
 * Run with: npx vitest run lib/__tests__/upload-validation.test.ts
 *
 * Covers every accepted upload type:
 * - PDF (header %PDF)
 * - DOCX (zip header PK\x03\x04)
 * - Images (JPG / PNG / GIF / WEBP)
 * - Text uploads (.txt, .vtt, .srt) — heuristic on non-printable ratio
 *
 * Plus the negative path for each: file content that doesn't match the
 * claimed extension is rejected with an error message that names the
 * filename and the actual reason.
 */

import { describe, it, expect } from "vitest";
import { validateMagicBytes } from "../upload-validation";

// ---------------------------------------------------------------------------
// Fixtures — minimal real magic-byte payloads padded with zeros so subarray
// reads beyond the header don't fall off the end.
// ---------------------------------------------------------------------------

const pad = (header: number[], len = 32) => {
  const buf = Buffer.alloc(len);
  for (let i = 0; i < header.length && i < len; i++) buf[i] = header[i];
  return buf;
};

const PDF = pad([0x25, 0x50, 0x44, 0x46]); // %PDF
const DOCX = pad([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
const JPG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87 = pad([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
const GIF89 = pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = (() => {
  // RIFF....WEBP — bytes 0-3 "RIFF", bytes 8-11 "WEBP"
  const b = Buffer.alloc(32);
  Buffer.from("RIFF").copy(b, 0);
  Buffer.from("WEBP").copy(b, 8);
  return b;
})();

const PLAIN_TEXT = Buffer.from("Patient symptoms over the last week:\nHeadaches at 3pm.\nLow energy.");
const BINARY_DISGUISED_AS_TEXT = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8,
]);

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

describe("validateMagicBytes — pdf", () => {
  it("accepts a real PDF header", () => {
    expect(() => validateMagicBytes(PDF, "pdf", "labs.pdf")).not.toThrow();
  });

  it("rejects a renamed PNG", () => {
    expect(() => validateMagicBytes(PNG, "pdf", "evil.pdf"))
      .toThrow(/has a \.pdf extension but isn't a valid PDF/);
  });

  it("rejects an empty buffer", () => {
    expect(() => validateMagicBytes(Buffer.alloc(0), "pdf", "empty.pdf"))
      .toThrow(/isn't a valid PDF/);
  });

  it("includes the filename in the error message", () => {
    expect(() => validateMagicBytes(PNG, "pdf", "intake-form.pdf"))
      .toThrow(/"intake-form\.pdf"/);
  });
});

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

describe("validateMagicBytes — docx", () => {
  it("accepts a real DOCX zip header", () => {
    expect(() => validateMagicBytes(DOCX, "docx", "intake.docx")).not.toThrow();
  });

  it("rejects a renamed PDF", () => {
    expect(() => validateMagicBytes(PDF, "docx", "evil.docx"))
      .toThrow(/has a \.docx extension but isn't a valid Word document/);
  });

  it("rejects content with wrong header byte", () => {
    const almostZip = Buffer.from([0x50, 0x4b, 0x05, 0x06]); // empty-archive central dir
    expect(() => validateMagicBytes(almostZip, "docx", "weird.docx"))
      .toThrow(/isn't a valid Word document/);
  });
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

describe("validateMagicBytes — image", () => {
  it("accepts a real JPG", () => {
    expect(() => validateMagicBytes(JPG, "image", "photo.jpg")).not.toThrow();
    expect(() => validateMagicBytes(JPG, "image", "photo.jpeg")).not.toThrow();
  });

  it("accepts a real PNG", () => {
    expect(() => validateMagicBytes(PNG, "image", "photo.png")).not.toThrow();
  });

  it("accepts a real GIF87a and GIF89a", () => {
    expect(() => validateMagicBytes(GIF87, "image", "photo.gif")).not.toThrow();
    expect(() => validateMagicBytes(GIF89, "image", "photo.gif")).not.toThrow();
  });

  it("accepts a real WEBP", () => {
    expect(() => validateMagicBytes(WEBP, "image", "photo.webp")).not.toThrow();
  });

  it("rejects a PDF renamed to .png", () => {
    expect(() => validateMagicBytes(PDF, "image", "fake.png"))
      .toThrow(/has a PNG extension but isn't a valid PNG/);
  });

  it("rejects a PNG renamed to .jpg", () => {
    expect(() => validateMagicBytes(PNG, "image", "fake.jpg"))
      .toThrow(/has a JPG extension but isn't a valid JPG/);
  });

  it("rejects random bytes renamed to .gif", () => {
    expect(() => validateMagicBytes(Buffer.from("not a gif at all"), "image", "fake.gif"))
      .toThrow(/has a GIF extension but isn't a valid GIF/);
  });

  it("rejects RIFF-but-not-WEBP renamed to .webp", () => {
    const riffWav = Buffer.alloc(32);
    Buffer.from("RIFF").copy(riffWav, 0);
    Buffer.from("WAVE").copy(riffWav, 8); // WAV, not WEBP
    expect(() => validateMagicBytes(riffWav, "image", "fake.webp"))
      .toThrow(/has a WEBP extension but isn't a valid WEBP/);
  });
});

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

describe("validateMagicBytes — txt", () => {
  it("accepts plain text content", () => {
    expect(() => validateMagicBytes(PLAIN_TEXT, "txt", "transcript.txt")).not.toThrow();
  });

  it("accepts an empty buffer (no length to fail the ratio check)", () => {
    expect(() => validateMagicBytes(Buffer.alloc(0), "txt", "empty.txt")).not.toThrow();
  });

  it("rejects binary content disguised as text", () => {
    expect(() => validateMagicBytes(BINARY_DISGUISED_AS_TEXT, "txt", "fake.txt"))
      .toThrow(/has a text extension but appears to be binary content/);
  });

  it("rejects a PDF renamed to .txt (PDF has %PDF then binary stream)", () => {
    // A real PDF has stream sections full of binary content; fabricate a
    // minimal binary-heavy payload to mimic that.
    const fakePdfBytes = Buffer.concat([PDF.subarray(0, 4), BINARY_DISGUISED_AS_TEXT]);
    expect(() => validateMagicBytes(fakePdfBytes, "txt", "fake.txt"))
      .toThrow(/appears to be binary content/);
  });

  it("tolerates standard whitespace (tab, LF, CR)", () => {
    const withWhitespace = Buffer.from("line1\n\tindented\r\nline3");
    expect(() => validateMagicBytes(withWhitespace, "txt", "ok.txt")).not.toThrow();
  });
});
