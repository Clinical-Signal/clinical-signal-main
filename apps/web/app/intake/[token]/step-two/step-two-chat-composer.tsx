"use client";

import { Mic, MicOff, Send } from "lucide-react";
import type { Ref } from "react";

export type StepTwoChatComposerSpeech = {
  isSupported: boolean;
  isRecording: boolean;
  toggleRecording: () => void;
};

type StepTwoChatComposerProps = {
  inputId: string;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  inputDisabled: boolean;
  placeholder: string;
  speech: StepTwoChatComposerSpeech;
  variant: "sticky" | "inline";
  inputRef?: Ref<HTMLTextAreaElement>;
};

export function StepTwoChatComposer({
  inputId,
  input,
  onInputChange,
  onSend,
  inputDisabled,
  placeholder,
  speech,
  variant,
  inputRef,
}: StepTwoChatComposerProps) {
  const pill = (
    <div className="flex items-end gap-2 rounded-full border border-line bg-surface-sunken px-2 py-1.5 shadow-sm">
      <textarea
        ref={inputRef}
        id={inputId}
        rows={1}
        value={input}
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        disabled={inputDisabled}
        className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-snug text-ink placeholder:text-ink-subtle focus-visible:outline-none"
      />
      {speech.isSupported ? (
        <button
          type="button"
          title={speech.isRecording ? "Listening…" : "Dictate with microphone"}
          aria-label={speech.isRecording ? "Stop listening" : "Start voice input"}
          aria-pressed={speech.isRecording}
          disabled={inputDisabled}
          onClick={speech.toggleRecording}
          className={`mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 ${
            speech.isRecording
              ? "animate-pulse bg-danger-soft text-danger"
              : "text-ink-muted hover:bg-surface hover:text-ink"
          }`}
        >
          {speech.isRecording ? (
            <MicOff className="size-5" aria-hidden />
          ) : (
            <Mic className="size-5" aria-hidden />
          )}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Send message"
        disabled={inputDisabled || !input.trim()}
        onClick={onSend}
        className="mb-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-ink-inverse transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40"
      >
        <Send className="size-4" aria-hidden />
      </button>
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="mt-3 rounded-lg border border-line bg-accent-soft p-2 shadow-sm">
        <label className="sr-only" htmlFor={inputId}>
          Answer follow-up about your edit
        </label>
        {pill}
      </div>
    );
  }

  return (
    <>
      <label className="sr-only" htmlFor={inputId}>
        Your answer
      </label>
      {pill}
    </>
  );
}
