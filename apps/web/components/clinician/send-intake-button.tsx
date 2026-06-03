"use client";

import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

type SendState = "idle" | "sending" | "success" | "error";

export type SendIntakeButtonProps = {
  patientId: string;
  /** When true, intake is finalized — copy warns before reissuing a new link. */
  intakeFinished?: boolean;
};

type SendIntakeResponse = {
  intakeUrl?: string;
  patientEmail?: string;
  error?: string;
};

export function SendIntakeButton({
  patientId,
  intakeFinished = false,
}: SendIntakeButtonProps) {
  const [sendState, setSendState] = useState<SendState>("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const label =
    sendState === "success"
      ? "Link sent"
      : intakeFinished
        ? "Reissue intake link"
        : "Send intake link";

  const handleSend = useCallback(async () => {
    if (intakeFinished) {
      const confirmed = window.confirm(
        "This patient has already completed their intake. Send a new magic link? Their previous link will stop working.",
      );
      if (!confirmed) {
        return;
      }
    }

    setSendState("sending");
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/clinician/patients/${encodeURIComponent(patientId)}/send-intake`,
        { method: "POST", credentials: "include" },
      );

      const body = (await response.json().catch(() => ({}))) as SendIntakeResponse;

      if (!response.ok) {
        setSendState("error");
        setFeedback(
          body.error === "NOT_AUTHENTICATED"
            ? "Sign in to send intake links."
            : "Could not send the intake link. Try again.",
        );
        return;
      }

      setSendState("success");
      const emailLine = body.patientEmail
        ? `Email queued to ${body.patientEmail}.`
        : "Intake link sent.";
      const urlLine = body.intakeUrl ? ` Open: ${body.intakeUrl}` : "";
      setFeedback(`${emailLine}${urlLine}`);
    } catch {
      setSendState("error");
      setFeedback("Network error — check your connection and try again.");
    }
  }, [intakeFinished, patientId]);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={sendState === "success" ? "secondary" : "primary"}
        size="sm"
        loading={sendState === "sending"}
        loadingText="Sending…"
        onClick={() => void handleSend()}
        disabled={sendState === "sending"}
        aria-live="polite"
      >
        {sendState === "success" ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon />
            {label}
          </span>
        ) : (
          label
        )}
      </Button>
      {feedback ? (
        <p
          className={`max-w-[16rem] text-right text-xs ${
            sendState === "error" ? "text-danger" : "text-ink-muted"
          }`}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-success"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}
