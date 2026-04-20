"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { IntakeDocSummary, DocType } from "@/lib/intake-documents";

// Client-side PDF text extraction using pdf.js from CDN.
// Loaded dynamically on first PDF upload — no server dependency.
let pdfjsLoaded: Promise<void> | null = null;

function loadPdfJs(): Promise<void> {
  if (pdfjsLoaded) return pdfjsLoaded;
  pdfjsLoaded = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && (window as any).pdfjsLib) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = () => {
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve();
    };
    script.onerror = () => reject(new Error("Failed to load PDF.js"));
    document.head.appendChild(script);
  });
  return pdfjsLoaded;
}

async function extractPdfTextInBrowser(file: File): Promise<string> {
  await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str).join(" "));
  }
  return pages.join("\n");
}

const DOC_TYPE_LABELS: Record<string, string> = {
  transcript: "Transcript",
  pdf: "PDF",
  docx: "Word",
  txt: "Text",
  image: "Image",
  note: "Note",
  video: "Video",
  audio: "Audio",
};

const DOC_TYPE_ICON: Record<string, string> = {
  transcript: "\u{1F399}",
  pdf: "\u{1F4C4}",
  docx: "\u{1F4DD}",
  txt: "\u{1F4C3}",
  image: "\u{1F5BC}",
  note: "\u{270F}",
  video: "\u{1F3AC}",
  audio: "\u{1F3B5}",
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
  const [typeFilter, setTypeFilter] = useState<DocType | "all">("all");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const refreshDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/patients/" + patientId + "/intake-docs");
      if (res.ok) setDocs(await res.json());
    } catch { /* ignore */ }
    router.refresh();
  }, [patientId, router]);

  const filteredDocs = useMemo(
    () => typeFilter === "all" ? docs : docs.filter((d) => d.docType === typeFilter),
    [docs, typeFilter],
  );

  const docTypes = useMemo(
    () => [...new Set(docs.map((d) => d.docType))],
    [docs],
  );

  const tabs = [
    { key: "transcript" as const, label: "Paste transcript" },
    { key: "upload" as const, label: "Upload file" },
    { key: "note" as const, label: "Practitioner notes" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PrepBriefSection patientId={patientId} onGenerated={refreshDocs} />

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-line bg-surface-sunken/40 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all sm:flex-none ${
              activeTab === tab.key
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-subtle hover:text-ink hover:bg-surface/50"
            }`}
          >
            {tab.label}
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

      {/* Document list */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Documents ({docs.length})
          </h3>
          {docTypes.length > 1 && (
            <div className="flex gap-1">
              <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
                All
              </FilterChip>
              {docTypes.map((t) => (
                <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                  {DOC_TYPE_LABELS[t] ?? t}
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        {filteredDocs.length === 0 ? (
          <EmptyState
            title={docs.length === 0 ? "No documents yet" : "No matching documents"}
            description={
              docs.length === 0
                ? "Paste a call transcript, upload a file, or add a clinical note."
                : "Try clearing the filter."
            }
          />
        ) : (
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {filteredDocs.map((d) => (
              <div key={d.id} className="group">
                <button
                  type="button"
                  onClick={() => setExpandedDoc(expandedDoc === d.id ? null : d.id)}
                  className="flex w-full items-start justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-surface-sunken/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-base" aria-hidden>
                        {DOC_TYPE_ICON[d.docType] ?? "\u{1F4CE}"}
                      </span>
                      <span className="font-medium text-ink">
                        {d.originalFilename ?? DOC_TYPE_LABELS[d.docType] ?? d.docType}
                      </span>
                      <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs text-ink-subtle">
                        {DOC_TYPE_LABELS[d.docType] ?? d.docType}
                      </span>
                    </div>
                    <div className="mt-0.5 pl-7 text-xs text-ink-subtle">
                      {new Date(d.uploadedAt).toLocaleString()}
                      {d.chunkCount > 0 ? " \u00B7 " + d.chunkCount + " chunks" : ""}
                      {d.fileSizeBytes ? " \u00B7 " + (d.fileSizeBytes / 1024).toFixed(0) + " KB" : ""}
                    </div>
                    {!expandedDoc && d.extractedTextPreview ? (
                      <p className="mt-1 line-clamp-1 pl-7 text-xs text-ink-faint">
                        {d.extractedTextPreview}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
                        d.status === "complete"
                          ? "bg-success-soft text-success"
                          : d.status === "failed"
                            ? "bg-danger-soft text-danger"
                            : "bg-warning-soft text-warning"
                      }`}
                    >
                      {d.status === "complete" ? "Ready" : d.status === "failed" ? "Failed" : "Processing"}
                    </span>
                    <span className={`text-xs text-ink-faint transition-transform ${expandedDoc === d.id ? "rotate-180" : ""}`}>
                      \u25BC
                    </span>
                  </div>
                </button>
                {expandedDoc === d.id && d.extractedTextPreview ? (
                  <div className="border-t border-line bg-surface-sunken/20 px-5 py-3">
                    <p className="whitespace-pre-wrap text-xs text-ink-muted leading-relaxed">
                      {d.extractedTextPreview}...
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-accent text-ink-inverse"
          : "bg-surface-sunken text-ink-subtle hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Transcript paste
// ---------------------------------------------------------------------------

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
      setResult("Transcript added \u2014 " + data.chunks + " chunks processed.");
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
        Paste from Zoom, Meet, or Otter. Clinical reasoning will be extracted for protocol generation.
      </p>
      <textarea
        className="mb-3 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        rows={8}
        placeholder="Paste call transcript here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} loading={submitting} loadingText="Processing..." disabled={!text.trim()}>
          Add transcript
        </Button>
        {text.trim() && (
          <span className="text-xs text-ink-faint">
            ~{Math.ceil(text.length / 4).toLocaleString()} tokens
          </span>
        )}
        {result ? <span className="text-sm text-success">{result}</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File upload
// ---------------------------------------------------------------------------

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
      if (file.name.toLowerCase().endsWith(".pdf")) {
        // Extract text CLIENT-SIDE using pdf.js from CDN — avoids all
        // server-side PDF library issues on Vercel serverless.
        setResult("Extracting text from PDF...");
        const text = await extractPdfTextInBrowser(file);
        if (!text.trim()) throw new Error("No readable text found in this PDF.");
        setResult("Uploading extracted text (" + Math.ceil(text.length / 1024) + " KB)...");
        const res = await fetch("/api/patients/" + patientId + "/intake-docs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "transcript",
            text,
            title: file.name,
          }),
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("Server returned an unexpected response (status " + res.status + "). Try logging out and back in.");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setResult("PDF processed \u2014 " + data.chunks + " chunks extracted.");
      } else {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch("/api/patients/" + patientId + "/intake-docs", {
          method: "POST",
          body: fd,
        });
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("Server returned an unexpected response (status " + res.status + "). Try logging out and back in.");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        setResult(
          data.extracted
            ? "File processed \u2014 text extracted."
            : "File stored (no text extraction for this type).",
        );
      }
      setFile(null);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const fileIcon = file
    ? file.name.endsWith(".pdf")
      ? "\u{1F4C4}"
      : file.name.endsWith(".docx")
        ? "\u{1F4DD}"
        : "\u{1F4C3}"
    : null;

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <h3 className="mb-1 text-sm font-semibold text-ink">Upload a file</h3>
      <p className="mb-3 text-xs text-ink-subtle">
        PDF, Word (.docx), text (.txt, .vtt, .srt), or images. Text is extracted automatically.
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
        className={`mb-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-all ${
          dragOver
            ? "border-accent bg-accent-soft/40 scale-[1.01]"
            : "border-line-strong bg-surface-sunken/20 hover:bg-surface-sunken/40 hover:border-ink-faint"
        }`}
      >
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.docx,.txt,.vtt,.srt,.jpg,.jpeg,.png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <span className="text-2xl">{fileIcon}</span>
            <span className="text-sm font-medium text-ink">{file.name}</span>
            <span className="text-xs text-ink-subtle">
              {(file.size / 1024).toFixed(0)} KB
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl text-ink-faint">{"\u{1F4C1}"}</span>
            <span className="text-sm font-medium text-ink">Drop a file here, or click to browse</span>
            <span className="text-xs text-ink-subtle">PDF, DOCX, TXT, VTT, SRT, JPG, PNG</span>
          </>
        )}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={upload} loading={submitting} loadingText="Uploading..." disabled={!file}>
          Upload file
        </Button>
        {file && (
          <button type="button" onClick={() => setFile(null)} className="text-sm text-ink-subtle hover:text-ink">
            Clear
          </button>
        )}
        {result ? <span className="text-sm text-success">{result}</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Practitioner notes
// ---------------------------------------------------------------------------

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
        Clinical observations, call impressions, or anything you want the AI to consider.
      </p>
      <textarea
        className="mb-3 w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        rows={6}
        placeholder="Type clinical notes here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} loading={submitting} loadingText="Saving..." disabled={!text.trim()}>
          Save note
        </Button>
        {result ? <span className="text-sm text-success">{result}</span> : null}
        {error ? <span className="text-sm text-danger">{error}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-call prep brief
// ---------------------------------------------------------------------------

interface PrepBrief {
  patient_summary?: string;
  preliminary_observations?: string[];
  suggested_lab_panels?: Array<{ panel: string; reasoning: string }>;
  questions_to_ask?: Array<{ question: string; why: string }>;
  working_hypotheses?: Array<{
    hypothesis: string;
    supporting_evidence: string;
    would_rule_out: string;
  }>;
  call_agenda?: string[];
}

function PrepBriefSection({
  patientId,
  onGenerated,
}: {
  patientId: string;
  onGenerated: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [brief, setBrief] = useState<PrepBrief | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    setBrief(null);
    setStatus("Starting...");

    try {
      const res = await fetch("/api/patients/" + patientId + "/prep-brief", {
        method: "POST",
      });
      if (!res.ok || !res.body) throw new Error("Server returned " + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            if (evt.error) throw new Error(evt.error);
            if (evt.status) setStatus(evt.status);
            if (evt.done && evt.brief) { setBrief(evt.brief); onGenerated(); }
          } catch (e) {
            if (e instanceof Error && e.message) throw e;
          }
        }
      }
      if (buffer.trim()) {
        try {
          const evt = JSON.parse(buffer);
          if (evt.done && evt.brief) { setBrief(evt.brief); onGenerated(); }
          if (evt.error) throw new Error(evt.error);
        } catch (e) {
          if (e instanceof Error && e.message) throw e;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
      setStatus(null);
    }
  }

  function copyToClipboard() {
    if (!brief) return;
    const lines: string[] = [];
    if (brief.patient_summary) lines.push("PATIENT SUMMARY\n" + brief.patient_summary + "\n");
    if (brief.preliminary_observations?.length) {
      lines.push("PRELIMINARY OBSERVATIONS");
      brief.preliminary_observations.forEach((o) => lines.push("- " + o));
      lines.push("");
    }
    if (brief.suggested_lab_panels?.length) {
      lines.push("SUGGESTED LAB PANELS");
      brief.suggested_lab_panels.forEach((l) => lines.push("- " + l.panel + ": " + l.reasoning));
      lines.push("");
    }
    if (brief.questions_to_ask?.length) {
      lines.push("QUESTIONS TO ASK");
      brief.questions_to_ask.forEach((q) => lines.push("- " + q.question + " (" + q.why + ")"));
      lines.push("");
    }
    if (brief.working_hypotheses?.length) {
      lines.push("WORKING HYPOTHESES");
      brief.working_hypotheses.forEach((h) =>
        lines.push("- " + h.hypothesis + "\n  Evidence: " + h.supporting_evidence + "\n  Rule out: " + h.would_rule_out),
      );
      lines.push("");
    }
    if (brief.call_agenda?.length) {
      lines.push("CALL AGENDA");
      brief.call_agenda.forEach((a, i) => lines.push((i + 1) + ". " + a));
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(() => {});
  }

  return (
    <section className="rounded-xl border border-line bg-surface print:border-0 print:p-0">
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4 print:border-0">
        <div>
          <h3 className="text-base font-semibold text-ink">Pre-call prep brief</h3>
          <p className="mt-0.5 text-xs text-ink-subtle">
            AI-generated briefing from all uploaded patient data. Read before your call.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {brief && (
            <>
              <Button variant="ghost" size="sm" onClick={copyToClipboard}>
                Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => window.print()}>
                Print
              </Button>
            </>
          )}
          <Button
            size="sm"
            loading={generating}
            loadingText="Generating..."
            onClick={generate}
          >
            {brief ? "Regenerate" : "Generate prep brief"}
          </Button>
        </div>
      </div>

      {generating && status ? (
        <div className="px-6 py-4">
          <p className="text-sm text-ink-muted">{status}</p>
          <p className="mt-1 text-xs text-ink-faint">This typically takes 30\u201360 seconds.</p>
        </div>
      ) : null}

      {error ? (
        <div className="px-6 py-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      ) : null}

      {brief ? <PrepBriefDisplay brief={brief} /> : null}
    </section>
  );
}

function PrepBriefDisplay({ brief }: { brief: PrepBrief }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  return (
    <div className="flex flex-col divide-y divide-line print:divide-0">
      {brief.patient_summary ? (
        <BriefSection title="Patient summary" sectionKey="summary" collapsed={collapsed} toggle={toggle}>
          <p className="text-sm text-ink leading-relaxed">{brief.patient_summary}</p>
        </BriefSection>
      ) : null}

      {brief.preliminary_observations?.length ? (
        <BriefSection title="Preliminary observations" sectionKey="observations" collapsed={collapsed} toggle={toggle}>
          <ul className="flex flex-col gap-1.5">
            {brief.preliminary_observations.map((obs, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink-muted">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {obs}
              </li>
            ))}
          </ul>
        </BriefSection>
      ) : null}

      {brief.suggested_lab_panels?.length ? (
        <BriefSection title="Suggested lab panels" sectionKey="labs" collapsed={collapsed} toggle={toggle}>
          <div className="flex flex-col gap-2">
            {brief.suggested_lab_panels.map((lab, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-sunken/30 px-3 py-2 print:border-0 print:bg-transparent print:px-0">
                <div className="text-sm font-medium text-ink">{lab.panel}</div>
                <div className="mt-0.5 text-xs text-ink-subtle">{lab.reasoning}</div>
              </div>
            ))}
          </div>
        </BriefSection>
      ) : null}

      {brief.questions_to_ask?.length ? (
        <BriefSection title="Questions to ask" sectionKey="questions" collapsed={collapsed} toggle={toggle}>
          <div className="flex flex-col gap-2">
            {brief.questions_to_ask.map((q, i) => (
              <div key={i}>
                <div className="text-sm font-medium text-ink">{q.question}</div>
                <div className="text-xs text-ink-subtle">{q.why}</div>
              </div>
            ))}
          </div>
        </BriefSection>
      ) : null}

      {brief.working_hypotheses?.length ? (
        <BriefSection title="Working hypotheses" sectionKey="hypotheses" collapsed={collapsed} toggle={toggle}>
          <div className="flex flex-col gap-3">
            {brief.working_hypotheses.map((h, i) => (
              <div key={i} className="rounded-lg border border-line bg-surface-sunken/30 px-3 py-2 print:border-0 print:bg-transparent print:px-0">
                <div className="text-sm font-medium text-ink">{h.hypothesis}</div>
                <div className="mt-1 text-xs text-ink-muted">
                  <strong className="text-ink-subtle">Supports:</strong> {h.supporting_evidence}
                </div>
                <div className="text-xs text-ink-muted">
                  <strong className="text-ink-subtle">Rule out:</strong> {h.would_rule_out}
                </div>
              </div>
            ))}
          </div>
        </BriefSection>
      ) : null}

      {brief.call_agenda?.length ? (
        <BriefSection title="Suggested call agenda" sectionKey="agenda" collapsed={collapsed} toggle={toggle}>
          <ol className="flex flex-col gap-1 text-sm text-ink-muted">
            {brief.call_agenda.map((item, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-xs font-medium text-ink-subtle">{i + 1}.</span>
                {item}
              </li>
            ))}
          </ol>
        </BriefSection>
      ) : null}
    </div>
  );
}

function BriefSection({
  title,
  sectionKey,
  collapsed,
  toggle,
  children,
}: {
  title: string;
  sectionKey: string;
  collapsed: Record<string, boolean>;
  toggle: (key: string) => void;
  children: React.ReactNode;
}) {
  const isCollapsed = collapsed[sectionKey] ?? false;
  return (
    <div className="print:break-inside-avoid">
      <button
        type="button"
        onClick={() => toggle(sectionKey)}
        className="flex w-full items-center justify-between px-6 py-3 text-left print:cursor-default"
      >
        <h4 className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
          {title}
        </h4>
        <span className={`text-xs text-ink-faint transition-transform print:hidden ${isCollapsed ? "" : "rotate-180"}`}>
          \u25BC
        </span>
      </button>
      {!isCollapsed && (
        <div className="px-6 pb-4">{children}</div>
      )}
    </div>
  );
}
