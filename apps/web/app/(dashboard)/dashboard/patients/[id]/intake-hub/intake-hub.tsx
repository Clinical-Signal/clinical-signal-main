"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { IntakeDocSummary } from "@/lib/intake-documents";

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: "Call transcript",
  pdf: "PDF document",
  docx: "Word document",
  txt: "Text file",
  image: "Image",
  note: "Practitioner note",
  video: "Video",
  audio: "Audio",
};

export function IntakeHub({
  patientId,
  initialDocs,
}: {
  patientId: string;
  initialDocs: IntakeDocSummary[];
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [activeTab, setActiveTab] = useState<"transcript" | "upload" | "note">("transcript");

  const refreshDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/patients/" + patientId + "/intake-docs");
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      }
    } catch { /* ignore */ }
    router.refresh();
  }, [patientId, router]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-lg border border-line bg-surface-sunken/50 p-1">
        {(["transcript", "upload", "note"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-subtle hover:text-ink"
            }`}
          >
            {tab === "transcript"
              ? "Paste transcript"
              : tab === "upload"
                ? "Upload file"
                : "Practitioner notes"}
          </button>
        ))}
      </div>

      {activeTab === "transcript" && (
        <TranscriptPaste patientId={patientId} onSuccess={refreshDocs} />
      )}
      {activeTab === "upload" && (
        <FileUpload patientId={patientId} onSuccess={refreshDocs} />
      )}
      {activeTab === "note" && (
        <PractitionerNote patientId={patientId} onSuccess={refreshDocs} />
      )}

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">
          Documents ({docs.length})
        </h3>
        {docs.length === 0 ? (
          <EmptyState
            title="No documents yet"
            description="Paste a call transcript, upload a file, or add a clinical note to get started."
          />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {docs.map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-ink">
                      {d.originalFilename ?? DOC_TYPE_LABELS[d.docType] ?? d.docType}
                    </span>
                    <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-subtle">
                      {DOC_TYPE_LABELS[d.docType] ?? d.docType}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-ink-subtle">
                    {new Date(d.uploadedAt).toLocaleString()}
                    {d.chunkCount > 0 ? ` · ${d.chunkCount} chunks` : ""}
                    {d.fileSizeBytes
                      ? ` · ${(d.fileSizeBytes / 1024).toFixed(0)} KB`
                      : ""}
                  </div>
                  {d.extractedTextPreview ? (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-faint">
                      {d.extractedTextPreview}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                    d.status === "complete"
                      ? "bg-success-soft text-success"
                      : d.status === "failed"
                        ? "bg-danger-soft text-danger"
                        : "bg-warning-soft text-warning"
                  }`}
                >
                  {d.status === "complete"
                    ? "Ready"
                    : d.status === "failed"
                      ? "Failed"
                      : "Processing"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TranscriptPaste({
  patientId,
  onSuccess,
}: {
  patientId: string;
  onSuccess: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/patients/" + patientId + "/intake-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "transcript", text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult("Transcript added — " + data.chunks + " chunks processed.");
      setText("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-ink">Paste a call transcript</h3>
      <p className="mb-3 text-xs text-ink-subtle">
        Paste the full text from a Zoom, Meet, or Otter transcript. Clinical
        reasoning and treatment decisions will be extracted for protocol generation.
      </p>
      <textarea
        className="mb-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        rows={8}
        placeholder="Paste call transcript here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          onClick={submit}
          loading={submitting}
          loadingText="Processing..."
          disabled={!text.trim()}
        >
          Add transcript
        </Button>
        {result ? <span className="text-sm text-success">{result}</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

function FileUpload({
  patientId,
  onSuccess,
}: {
  patientId: string;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function upload() {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/patients/" + patientId + "/intake-docs", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(
        data.extracted
          ? "File processed — text extracted."
          : "File stored (no text extraction for this type).",
      );
      setFile(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-ink">Upload a file</h3>
      <p className="mb-3 text-xs text-ink-subtle">
        PDF, Word (.docx), text files (.txt, .vtt, .srt), or images. Text is
        extracted automatically from PDFs and Word documents.
      </p>
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
        className={`mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft/40"
            : "border-line-strong bg-surface-sunken/30 hover:bg-surface-sunken/60"
        }`}
      >
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.docx,.txt,.vtt,.srt,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <span className="text-sm font-medium text-ink">
          {file ? file.name : "Drop a file here, or click to browse"}
        </span>
        {file ? (
          <span className="text-xs text-ink-subtle">
            {(file.size / 1024).toFixed(0)} KB
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">
            PDF, DOCX, TXT, VTT, SRT, JPG, PNG
          </span>
        )}
      </label>
      <div className="flex items-center gap-3">
        <Button
          onClick={upload}
          loading={submitting}
          loadingText="Uploading..."
          disabled={!file}
        >
          Upload file
        </Button>
        {file ? (
          <button
            type="button"
            onClick={() => setFile(null)}
            className="text-sm text-ink-subtle hover:text-ink"
          >
            Clear
          </button>
        ) : null}
        {result ? <span className="text-sm text-success">{result}</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

function PractitionerNote({
  patientId,
  onSuccess,
}: {
  patientId: string;
  onSuccess: () => void;
}) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/patients/" + patientId + "/intake-docs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setResult("Note saved.");
      setText("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-ink">Practitioner notes</h3>
      <p className="mb-3 text-xs text-ink-subtle">
        Clinical observations, call impressions, or anything you want the AI to
        consider when generating the protocol.
      </p>
      <textarea
        className="mb-3 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        rows={6}
        placeholder="Type clinical notes here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <Button
          onClick={submit}
          loading={submitting}
          loadingText="Saving..."
          disabled={!text.trim()}
        >
          Save note
        </Button>
        {result ? <span className="text-sm text-success">{result}</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </div>
  );
}
