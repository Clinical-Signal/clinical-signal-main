"use client";

import { StepTwoChatComposer, type StepTwoChatComposerSpeech } from "./step-two-chat-composer";

type StepTwoChatInputBarProps = {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onFinish: () => void;
  inputDisabled: boolean;
  isComplete: boolean;
  isSubmitting: boolean;
  speech: StepTwoChatComposerSpeech;
};

export function StepTwoChatInputBar({
  input,
  onInputChange,
  onSend,
  onFinish,
  inputDisabled,
  isComplete,
  isSubmitting,
  speech,
}: StepTwoChatInputBarProps) {
  if (isComplete) {
    return (
      <div className="sticky bottom-0 z-10 shrink-0 border-t border-line bg-surface/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-chat-composer backdrop-blur-sm">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onFinish}
          className="flex w-full items-center justify-center rounded-full bg-accent px-6 py-4 text-base font-semibold text-ink-inverse shadow-sm transition-colors animate-pulse hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-focus disabled:animate-none disabled:opacity-60"
        >
          {isSubmitting ? "Submitting intake…" : "Finish & Submit Intake"}
        </button>
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
