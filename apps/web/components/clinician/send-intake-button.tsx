"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

type SendState = "idle" | "sending" | "success" | "error";

export type SendIntakeButtonProps = {
  patientId: string;
  /** When true, intake is finalized — confirm before reissuing a new intake link. */
  intakeFinished?: boolean;
};

type SendIntakeResponse = {
  error?: string;
  message?: string;
};

const INTAKE_LINK_SENT_MESSAGE =
  "Intake link successfully sent to the patient's email.";

export function SendIntakeButton({
  patientId,
  intakeFinished = false,
}: SendIntakeButtonProps) {
  const router = useRouter();
  const [sendState, setSendState] = useState<SendState>("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  const isSending = sendState === "sending";
  const isSuccess = sendState === "success";

  const label = isSuccess
    ? "Link sent"
    : intakeFinished
      ? "Reissue Intake Link"
      : "Send Intake Link";

  const handleSend = useCallback(async () => {
    if (intakeFinished) {
      const confirmed = window.confirm(
        "This patient has already completed their intake. Send a new intake link? Their previous link will stop working.",
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
        if (body.error === "NOT_AUTHENTICATED") {
          setFeedback("Sign in to send intake links.");
        } else if (body.error === "ACTIVE_TOKEN_EXISTS") {
          setFeedback("An active link already exists. Refresh the page or try again.");
        } else if (body.error === "PATIENT_EMAIL_REQUIRED") {
          setFeedback(
            "Add the patient's email on their intake record before sending a link.",
          );
        } else if (body.error === "EMAIL_DISPATCH_FAILED") {
          setFeedback(
            body.message ?? "Failed to dispatch email. Please try again.",
          );
        } else {
          setFeedback("Could not send the intake link. Try again.");
        }
        return;
      }

      setSendState("success");
      setFeedback(INTAKE_LINK_SENT_MESSAGE);
      router.refresh();
    } catch {
      setSendState("error");
      setFeedback("Network error — check your connection and try again.");
    }
  }, [intakeFinished, patientId, router]);

  return (
    <>
      {sendState === "error" && feedback ? (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-6 left-1/2 z-50 w-[min(100%,22rem)] -translate-x-1/2 rounded-lg border border-line bg-surface px-4 py-3 text-center text-sm text-danger shadow-sm"
        >
          {feedback}
        </div>
      ) : null}
      <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant={isSuccess ? "secondary" : "primary"}
        size="sm"
        loading={isSending}
        loadingText="Sending…"
        onClick={() => void handleSend()}
        disabled={isSending}
        aria-live="polite"
      >
        {isSuccess ? (
          <span className="inline-flex items-center gap-1.5">
            <CheckIcon />
            {label}
          </span>
        ) : (
          label
        )}
      </Button>
      {feedback && sendState !== "error" ? (
        <p
          className="max-w-[18rem] text-right text-xs leading-snug text-ink-muted"
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </div>
    </>
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
