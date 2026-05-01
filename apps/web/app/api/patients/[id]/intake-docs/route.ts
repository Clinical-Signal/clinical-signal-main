import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { apiError, ERROR_CODES } from "@/lib/api-error";
import { patientBelongsToTenant } from "@/lib/records";
import {
  insertDocument,
  insertChunks,
  chunkText,
  listIntakeDocs,
} from "@/lib/intake-documents";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);
    const docs = await listIntakeDocs(user.tenantId, ctx.params.id);
    return NextResponse.json(docs);
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}

export async function POST(
  req: Request,
  ctx: { params: { id: string } },
) {
  try {
    const user = await apiAuth();
    if (!user) return apiError(ERROR_CODES.NOT_AUTHENTICATED, 401);
    const ok = await patientBelongsToTenant(user.tenantId, ctx.params.id);
    if (!ok) return apiError(ERROR_CODES.NOT_FOUND, 404);

    const contentType = req.headers.get("content-type") ?? "";
    const patientId = ctx.params.id;

    // JSON body: transcript paste, practitioner note, or client-side PDF text
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        type: "transcript" | "note";
        text: string;
        title?: string;
      };

      if (!body.text?.trim()) {
        return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
      }

      const docType = body.type === "note" ? "note" : "transcript";
      const text = body.text.trim();

      const docId = await insertDocument({
        tenantId: user.tenantId,
        patientId,
        practitionerId: user.practitionerId,
        docType,
        originalFilename: body.title || (docType === "note" ? "Practitioner note" : "Call transcript"),
        blobUrl: null,
        fileSizeBytes: Buffer.byteLength(text, "utf-8"),
        extractedText: text,
      });

      const chunks = chunkText(text);
      await insertChunks({
        tenantId: user.tenantId,
        documentId: docId,
        chunks,
      });

      return NextResponse.json({ id: docId, chunks: chunks.length });
    }

    // FormData: file upload (PDF, DOCX, TXT)
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      if (!file || file.size === 0) {
        return NextResponse.json({ error: "No file provided." }, { status: 400 });
      }

      const name = file.name.toLowerCase();
      const bytes = Buffer.from(await file.arrayBuffer());
      let extractedText = "";
      let docType: "pdf" | "docx" | "txt" | "image" = "txt";

      if (name.endsWith(".pdf")) {
        docType = "pdf";
        extractedText = "(PDF text extracted client-side)";
      } else if (name.endsWith(".docx")) {
        docType = "docx";
        try {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ buffer: bytes });
          extractedText = result.value;
        } catch (err) {
          return apiError(ERROR_CODES.VALIDATION_ERROR, 400, err);
        }
      } else if (name.endsWith(".txt") || name.endsWith(".vtt") || name.endsWith(".srt")) {
        docType = "txt";
        extractedText = bytes.toString("utf-8");
      } else if (/\.(jpg|jpeg|png|gif|webp)$/i.test(name)) {
        docType = "image";
        extractedText = "(image — no text extraction)";
      } else {
        return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
      }

      const docId = await insertDocument({
        tenantId: user.tenantId,
        patientId,
        practitionerId: user.practitionerId,
        docType,
        originalFilename: file.name,
        blobUrl: null,
        fileSizeBytes: file.size,
        extractedText,
      });

      if (extractedText && docType !== "image") {
        const chunks = chunkText(extractedText);
        await insertChunks({
          tenantId: user.tenantId,
          documentId: docId,
          chunks,
        });
      }

      return NextResponse.json({ id: docId, docType, extracted: extractedText.length > 0 });
    }

    return apiError(ERROR_CODES.VALIDATION_ERROR, 400);
  } catch (err) {
    return apiError(ERROR_CODES.INTERNAL_ERROR, 500, err);
  }
}
