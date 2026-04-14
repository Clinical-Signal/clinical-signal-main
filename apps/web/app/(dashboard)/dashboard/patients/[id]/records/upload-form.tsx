"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadLabAction } from "./actions";

const MAX_MB = 50;

export function UploadForm({ patientId }: { patientId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a file.");
      return;
    }
    if (file.type !== "application/pdf") {
      setError("Only PDF files are supported.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File exceeds ${MAX_MB} MB.`);
      return;
    }
    setPending(true);
    try {
      const res = await uploadLabAction(undefined, fd);
      if (res?.error) setError(res.error);
      else {
        formRef.current?.reset();
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
      className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <label className="flex flex-col gap-1 text-sm">
        Upload lab PDF (max {MAX_MB} MB)
        <input
          type="file"
          name="file"
          accept="application/pdf"
          required
          className="text-sm"
        />
      </label>
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {pending ? (
        <p className="text-sm text-slate-600" role="status">Uploading…</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
    </form>
  );
}
