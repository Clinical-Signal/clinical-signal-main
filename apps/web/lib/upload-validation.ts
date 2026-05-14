// Magic-byte validation for uploaded files. Filename extension alone is
// forgeable; pair it with a header-byte check so a renamed file can't
// sneak in as a different type. Mirrors the inline PDF check that
// lib/records.ts:152 uses for lab uploads.

export type UploadType = "pdf" | "docx" | "txt" | "image";

export function validateMagicBytes(
  bytes: Buffer,
  claimedType: UploadType,
  filename: string,
): void {
  if (claimedType === "pdf") {
    if (bytes.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error(`File "${filename}" has a .pdf extension but isn't a valid PDF.`);
    }
    return;
  }

  if (claimedType === "docx") {
    // DOCX is a zip — leading bytes PK\x03\x04.
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

  if (claimedType === "image") {
    const lower = filename.toLowerCase();
    if (
      (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) &&
      !(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    ) {
      throw new Error(`File "${filename}" has a JPG extension but isn't a valid JPG.`);
    }
    if (
      lower.endsWith(".png") &&
      !(
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      )
    ) {
      throw new Error(`File "${filename}" has a PNG extension but isn't a valid PNG.`);
    }
    if (
      lower.endsWith(".gif") &&
      bytes.subarray(0, 6).toString("ascii") !== "GIF87a" &&
      bytes.subarray(0, 6).toString("ascii") !== "GIF89a"
    ) {
      throw new Error(`File "${filename}" has a GIF extension but isn't a valid GIF.`);
    }
    if (
      lower.endsWith(".webp") &&
      !(
        bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
        bytes.subarray(8, 12).toString("ascii") === "WEBP"
      )
    ) {
      throw new Error(`File "${filename}" has a WEBP extension but isn't a valid WEBP.`);
    }
    return;
  }

  if (claimedType === "txt") {
    // Heuristic: text uploads (.txt/.vtt/.srt) should be mostly printable.
    // > 5% non-printable (replacement chars + control chars outside tab/CR/LF)
    // signals binary content masquerading as text.
    const text = bytes.toString("utf-8");
    let nonPrintable = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code === 0xfffd) {
        nonPrintable++;
        continue;
      }
      if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
        nonPrintable++;
      }
    }
    if (text.length > 0 && nonPrintable / text.length > 0.05) {
      throw new Error(`File "${filename}" has a text extension but appears to be binary content.`);
    }
    return;
  }
}
