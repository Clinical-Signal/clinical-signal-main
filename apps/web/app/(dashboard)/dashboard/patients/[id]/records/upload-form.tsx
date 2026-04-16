"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadLabAction } from "./actions";

const MAX_MB = 50;

export function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function chooseFile(f: File | null) {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.type !== "application/pdf") {
      setError("That file isn't a PDF. Lab reports must be uploaded as PDFs.");
      setFile(null);
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_MB} MB. Please trim or split it first.`);
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("patientId", patientId);
      fd.set("file", file);
      const res = await uploadLabAction(undefined, fd);
      if (res?.error) setError(res.error);
      else {
        formRef.current?.reset();
        setFile(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="rounded-xl border border-line bg-surface"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <label
        htmlFor={`upload-${patientId}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0] ?? null;
          chooseFile(f);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-t-xl border-b border-dashed px-6 py-10 text-center transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft/40"
            : "border-line-strong bg-surface-sunken/30 hover:bg-surface-sunken/60"
        }`}
      >
        <input
          ref={fileInputRef}
          id={`upload-${patientId}`}
          type="file"
          name="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
        />
        <div className="text-sm font-medium text-ink">
          {file ? file.name : "Drop a lab PDF here, or click to browse"}
        </div>
        <div className="text-xs text-ink-subtle">
          {file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · PDF`
            : `PDF only · up to ${MAX_MB} MB`}
        </div>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="min-h-[1.5rem]">
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : pending ? (
            <p className="text-sm text-ink-muted" role="status">
              Uploading and queueing for extraction…
            </p>
          ) : file ? (
            <p className="text-sm text-ink-subtle">Ready to upload.</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {file ? (
            <button
              type="button"
              onClick={() => {
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-sm text-ink-subtle transition-colors hover:text-ink"
            >
              Clear
            </button>
          ) : null}
          <Button
            type="submit"
            disabled={!file}
            loading={pending}
            loadingText="Uploading…"
          >
            Upload lab results
          </Button>
        </div>
      </div>
    </form>
  );
}
