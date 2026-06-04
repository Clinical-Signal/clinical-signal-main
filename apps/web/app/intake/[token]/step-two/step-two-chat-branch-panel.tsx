"use client";

import { Stethoscope } from "lucide-react";
import type { Ref } from "react";

import type { UiChatBranch, UiChatMessage } from "@/lib/intake/partition-intake-chat-messages";

import {
  StepTwoChatComposer,
  type StepTwoChatComposerSpeech,
} from "./step-two-chat-composer";

type StepTwoChatBranchPanelProps = {
  branch: UiChatBranch;
  isOpen: boolean;
  isThinking: boolean;
  showInlineInput: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  inputDisabled: boolean;
  speech: StepTwoChatComposerSpeech;
  inputRef?: Ref<HTMLTextAreaElement>;
};

function BranchTypingIndicator() {
  return (
    <div className="flex items-end justify-start gap-2">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
        aria-hidden
      >
        <Stethoscope className="size-3.5" strokeWidth={2} />
      </div>
      <div className="rounded-2xl rounded-bl-sm border border-line bg-accent-soft px-3 py-2">
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-ink-subtle animate-typing-dot" />
          <span
            className="size-1.5 rounded-full bg-ink-subtle animate-typing-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="size-1.5 rounded-full bg-ink-subtle animate-typing-dot"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      </div>
    </div>
  );
}

function BranchBubble({ message }: { message: UiChatMessage }) {
  if (message.role === "assistant") {
    return (
      <div className="flex items-end justify-start gap-2 animate-message-in">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
          aria-hidden
        >
          <Stethoscope className="size-3.5" strokeWidth={2} />
        </div>
        <div className="max-w-[90%] rounded-2xl rounded-bl-sm border border-line bg-accent-soft px-3 py-2 text-sm leading-relaxed text-ink">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end animate-message-in">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm leading-relaxed text-ink-inverse">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export function StepTwoChatBranchPanel({
  branch,
  isOpen,
  isThinking,
  showInlineInput,
  input,
  onInputChange,
  onSend,
  inputDisabled,
  speech,
  inputRef,
}: StepTwoChatBranchPanelProps) {
  const inputId = `step-two-branch-input-${branch.parentMessageId}`;
  const panelOpen = isOpen || showInlineInput;

  return (
    <div
      className="ml-3 mt-2 border-l-2 border-accent-soft pl-3"
      data-active-branch={showInlineInput ? "true" : undefined}
    >
      <div
        className={`grid transition-all duration-300 ease-out ${
          panelOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-2 pb-1">
            <p className="text-xs font-medium text-accent">Follow-up on your edit</p>
            {branch.messages.map((message) => (
              <BranchBubble key={message.id} message={message} />
            ))}
            {isThinking ? <BranchTypingIndicator /> : null}
            {branch.isComplete ? (
              <p className="text-xs text-ink-subtle">
                Follow-up complete — continue in the main chat below.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {showInlineInput && !branch.isComplete ? (
        <StepTwoChatComposer
          inputId={inputId}
          input={input}
          onInputChange={onInputChange}
          onSend={onSend}
          inputDisabled={inputDisabled}
          placeholder="Answer the follow-up question…"
          speech={speech}
          variant="inline"
          inputRef={inputRef}
        />
      ) : null}
    </div>
  );
}
