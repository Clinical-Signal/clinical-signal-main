"use client";

import { Spinner } from "@/components/ui/button";

import { StepTwoChatComposer, type StepTwoChatComposerSpeech } from "./step-two-chat-composer";

type StepTwoChatInputBarProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  inputDisabled: boolean;
  isComplete: boolean;
  isSubmitting: boolean;
  speech: StepTwoChatComposerSpeech;
};

export function StepTwoChatInputBar({
  input,
  onInputChange,
  onSend,
  inputDisabled,
  isComplete,
  isSubmitting,
  speech,
}: StepTwoChatInputBarProps) {
  if (isComplete) {
    return (
      <div
        className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-chat-composer backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-ink-muted">
          {isSubmitting ? (
            <>
              <Spinner className="text-accent" />
              <span>Submitting your intake…</span>
            </>
          ) : (
            <span>Wrapping up your intake…</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-chat-composer backdrop-blur-sm">
      <StepTwoChatComposer
        inputId="step-two-chat-input"
        input={input}
        onInputChange={onInputChange}
        onSend={onSend}
        inputDisabled={inputDisabled}
        placeholder="Type your answer…"
        speech={speech}
        variant="sticky"
      />
    </div>
  );
}
