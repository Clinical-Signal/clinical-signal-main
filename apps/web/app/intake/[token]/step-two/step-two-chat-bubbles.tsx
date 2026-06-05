"use client";

import { Pencil, Stethoscope } from "lucide-react";
import { useEffect, useState } from "react";

import { isPersistedIntakeChatMessageId } from "@/lib/intake/intake-chat-message-id";
import type { UiChatBranch, UiChatMessage } from "@/lib/intake/partition-intake-chat-messages";

import type { Ref } from "react";

import { StepTwoChatBranchPanel } from "./step-two-chat-branch-panel";
import type { StepTwoChatComposerSpeech } from "./step-two-chat-composer";

export type ChatBubbleMessage = UiChatMessage;

type StepTwoChatBubblesProps = {
  messages: ChatBubbleMessage[];
  branches: Record<string, UiChatBranch>;
  openBranchIds: Set<string>;
  branchThinkingId: string | null;
  isMainThinking: boolean;
  canEdit: boolean;
  editingMessageId: string | null;
  isSavingEdit: boolean;
  onStartEdit: (messageId: string) => void;
  onCancelEdit: () => void;
  onSaveEdit: (messageId: string, content: string) => void;
  correctionNotice: string | null;
  activeBranchId: string | null;
  branchInput: string;
  onBranchInputChange: (value: string) => void;
  onBranchSend: () => void;
  branchInputDisabled: boolean;
  branchSpeech: StepTwoChatComposerSpeech;
  branchInputRef: Ref<HTMLTextAreaElement>;
};

function TypingIndicator() {
  return (
    <div className="flex items-end justify-start gap-2 animate-message-in">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
        aria-hidden
      >
        <Stethoscope className="size-4" strokeWidth={2} />
      </div>
      <div
        className="rounded-2xl rounded-bl-sm border border-line bg-accent-soft px-4 py-3 shadow-sm"
        role="status"
        aria-live="polite"
        aria-label="Assistant is typing"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-ink-subtle animate-typing-dot" />
          <span
            className="size-2 rounded-full bg-ink-subtle animate-typing-dot"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="size-2 rounded-full bg-ink-subtle animate-typing-dot"
            style={{ animationDelay: "300ms" }}
          />
        </span>
      </div>
    </div>
  );
}

function UserBubble({
  message,
  canEdit,
  isEditing,
  isSavingEdit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}: {
  message: ChatBubbleMessage;
  canEdit: boolean;
  isEditing: boolean;
  isSavingEdit: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (content: string) => void;
}) {
  const [draft, setDraft] = useState(message.content);

  useEffect(() => {
    if (isEditing) {
      setDraft(message.content);
    }
  }, [isEditing, message.content]);

  if (isEditing) {
    return (
      <div className="flex justify-end animate-message-in">
        <div className="w-full max-w-[92%] space-y-2 rounded-2xl rounded-br-sm border border-line bg-surface px-3 py-3 shadow-sm">
          <textarea
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={isSavingEdit}
            className="w-full resize-none rounded-md border border-line bg-surface-sunken px-2 py-2 text-sm text-ink focus-visible:outline-none focus-visible:shadow-focus"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isSavingEdit}
              className="rounded-md px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSaveEdit(draft.trim())}
              disabled={isSavingEdit || !draft.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-ink-inverse hover:bg-accent-hover disabled:opacity-50"
            >
              {isSavingEdit ? "Checking…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end animate-message-in">
      <div className="group relative max-w-[88%]">
        {canEdit ? (
          <button
            type="button"
            onClick={onStartEdit}
            aria-label="Edit message"
            className="absolute -left-9 top-2 rounded-md p-1.5 text-ink-subtle opacity-0 transition-opacity hover:bg-surface-sunken hover:text-ink group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus"
          >
            <Pencil className="size-4" aria-hidden />
          </button>
        ) : null}
        <div className="rounded-2xl rounded-br-sm bg-accent px-4 py-3 text-sm leading-relaxed text-ink-inverse shadow-sm">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatBubbleMessage }) {
  return (
    <div className="flex max-w-[92%] items-end justify-start gap-2 animate-message-in">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
        aria-hidden
      >
        <Stethoscope className="size-4" strokeWidth={2} />
      </div>
      <div className="min-w-0 rounded-2xl rounded-bl-sm border border-line bg-accent-soft px-4 py-3 text-sm leading-relaxed text-ink shadow-sm">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

export function StepTwoChatBubbles({
  messages,
  branches,
  openBranchIds,
  branchThinkingId,
  isMainThinking,
  canEdit,
  editingMessageId,
  isSavingEdit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  correctionNotice,
  activeBranchId,
  branchInput,
  onBranchInputChange,
  onBranchSend,
  branchInputDisabled,
  branchSpeech,
  branchInputRef,
}: StepTwoChatBubblesProps) {
  return (
    <div className="flex flex-col gap-4 py-4">
      {correctionNotice ? (
        <p className="animate-message-in text-center text-xs text-ink-muted" role="status">
          {correctionNotice}
        </p>
      ) : null}
      {messages.map((message) => (
        <div key={message.id} className="flex flex-col gap-1">
          {message.role === "user" ? (
            <UserBubble
              message={message}
              canEdit={canEdit && isPersistedIntakeChatMessageId(message.id)}
              isEditing={editingMessageId === message.id}
              isSavingEdit={isSavingEdit && editingMessageId === message.id}
              onStartEdit={() => onStartEdit(message.id)}
              onCancelEdit={onCancelEdit}
              onSaveEdit={(content) => onSaveEdit(message.id, content)}
            />
          ) : (
            <AssistantBubble message={message} />
          )}
          {branches[message.id] ? (
            <StepTwoChatBranchPanel
              branch={branches[message.id]!}
              isOpen={openBranchIds.has(message.id)}
              isThinking={branchThinkingId === message.id}
              showInlineInput={activeBranchId === message.id}
              input={branchInput}
              onInputChange={onBranchInputChange}
              onSend={onBranchSend}
              inputDisabled={branchInputDisabled}
              speech={branchSpeech}
              inputRef={branchInputRef}
            />
          ) : null}
        </div>
      ))}
      {isMainThinking ? <TypingIndicator /> : null}
    </div>
  );
}
