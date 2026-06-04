"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isIntakeChatCompleteFromMessages } from "@/lib/intake/intake-chat-budget";
import { INTAKE_CHAT_KICKOFF_MESSAGE } from "@/lib/intake/intake-chat-constants";
import type {
  BranchChatResponse,
  EditChatMessageResponse,
} from "@/lib/intake/intake-chat-edit-response";
import { stripCompleteMarker } from "@/lib/intake/intake-chat-markers";
import type { UiChatBranch } from "@/lib/intake/partition-intake-chat-messages";

import { StepTwoChatBubbles, type ChatBubbleMessage } from "./step-two-chat-bubbles";
import { StepTwoChatHeader } from "./step-two-chat-header";
import { StepTwoChatInputBar } from "./step-two-chat-input-bar";
import { useStepTwoSpeech } from "./use-step-two-speech";

type BranchMeta = {
  originalContent: string;
  editedContent: string;
  gatekeeperReason: string;
};

type StepTwoChatProps = {
  token: string;
  initialMessages: ChatBubbleMessage[];
  initialBranches: Record<string, UiChatBranch>;
};

export function StepTwoChat({
  token,
  initialMessages,
  initialBranches,
}: StepTwoChatProps) {
  const [messages, setMessages] = useState<ChatBubbleMessage[]>(initialMessages);
  const [branches, setBranches] =
    useState<Record<string, UiChatBranch>>(initialBranches);
  const [openBranchIds, setOpenBranchIds] = useState<Set<string>>(
    () => new Set(Object.keys(initialBranches)),
  );
  const [branchMeta, setBranchMeta] = useState<Record<string, BranchMeta>>({});
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [branchThinkingId, setBranchThinkingId] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(() =>
    isIntakeChatCompleteFromMessages(initialMessages),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [correctionNotice, setCorrectionNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const kickoffStarted = useRef(false);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const branchInputRef = useRef<HTMLTextAreaElement | null>(null);

  const activeBranch = activeBranchId ? branches[activeBranchId] : undefined;
  const branchInputLocked =
    Boolean(activeBranchId) && Boolean(activeBranch?.isComplete);
  const inputDisabled =
    isThinking ||
    isSubmitting ||
    isComplete ||
    isSavingEdit ||
    Boolean(branchThinkingId) ||
    branchInputLocked;

  const speech = useStepTwoSpeech({
    value: input,
    onValueChange: setInput,
    disabled: inputDisabled,
  });

  const scrollToLatest = useCallback(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  useEffect(() => {
    scrollToLatest();
  }, [messages, branches, isThinking, branchThinkingId, correctionNotice, scrollToLatest]);

  useEffect(() => {
    if (!activeBranchId || branchInputLocked) {
      return;
    }

    const focusInlineInput = () => {
      const node = branchInputRef.current;
      if (!node) {
        return;
      }
      node.focus({ preventScroll: false });
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    let timeoutId: number | undefined;
    const frame = requestAnimationFrame(() => {
      focusInlineInput();
      timeoutId = window.setTimeout(focusInlineInput, 320);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeBranchId, branchInputLocked]);

  const sendToApi = useCallback(
    async (message: string) => {
      if (isComplete || activeBranchId) {
        return;
      }
      setIsThinking(true);
      setErrorMessage(null);
      setCorrectionNotice(null);

      const isUserTurn =
        message.trim().length > 0 && message !== INTAKE_CHAT_KICKOFF_MESSAGE;
      if (isUserTurn) {
        setMessages((prev) => [
          ...prev,
          {
            id: `user-pending-${Date.now()}`,
            role: "user",
            content: message.trim(),
          },
        ]);
      }

      let response: Response;
      try {
        response = await fetch(
          `/api/intake/${encodeURIComponent(token)}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
          },
        );
      } catch {
        setIsThinking(false);
        setErrorMessage("Could not reach the server. Check your connection.");
        return;
      }

      let payload: {
        reply?: string;
        canFinish?: boolean;
        interviewComplete?: boolean;
        isComplete?: boolean;
        error?: string;
      };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        setIsThinking(false);
        setErrorMessage("Received an invalid response.");
        return;
      }

      setIsThinking(false);

      if (!response.ok) {
        setErrorMessage(
          payload.error ?? "An error occurred connecting to the AI.",
        );
        return;
      }

      if (!payload.reply) {
        setErrorMessage("The assistant did not return a reply. Try again.");
        return;
      }

      const { displayText } = stripCompleteMarker(payload.reply);

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: displayText,
        },
      ]);

      if (payload.isComplete ?? payload.canFinish ?? payload.interviewComplete) {
        setIsComplete(true);
        speech.stopRecording();
      }
    },
    [activeBranchId, isComplete, speech, token],
  );

  const sendBranchToApi = useCallback(
    async (parentMessageId: string, message: string) => {
      const meta = branchMeta[parentMessageId];
      if (!meta || branchInputLocked) {
        return;
      }

      setBranchThinkingId(parentMessageId);
      setErrorMessage(null);

      setBranches((prev) => {
        const branch = prev[parentMessageId];
        if (!branch) {
          return prev;
        }
        return {
          ...prev,
          [parentMessageId]: {
            ...branch,
            messages: [
              ...branch.messages,
              {
                id: `branch-user-${Date.now()}`,
                role: "user",
                content: message.trim(),
              },
            ],
          },
        };
      });

      let response: Response;
      try {
        response = await fetch(
          `/api/intake/${encodeURIComponent(token)}/chat/branch`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              parentMessageId,
              message,
              originalContent: meta.originalContent,
              editedContent: meta.editedContent,
              gatekeeperReason: meta.gatekeeperReason,
            }),
          },
        );
      } catch {
        setBranchThinkingId(null);
        setErrorMessage("Could not reach the server. Check your connection.");
        return;
      }

      let payload: BranchChatResponse & { error?: string };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        setBranchThinkingId(null);
        setErrorMessage("Received an invalid response.");
        return;
      }

      setBranchThinkingId(null);

      if (!response.ok) {
        setErrorMessage(payload.error ?? "Follow-up failed. Try again.");
        return;
      }

      setBranches((prev) => ({
        ...prev,
        [parentMessageId]: payload.branch,
      }));

      if (payload.branchComplete) {
        setActiveBranchId(null);
        setInput("");
      }
    },
    [branchInputLocked, branchMeta, token],
  );

  useEffect(() => {
    if (
      initialMessages.length === 0 &&
      !kickoffStarted.current &&
      !isComplete &&
      !activeBranchId
    ) {
      kickoffStarted.current = true;
      void sendToApi(INTAKE_CHAT_KICKOFF_MESSAGE);
    }
  }, [activeBranchId, initialMessages.length, isComplete, sendToApi]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isThinking || branchThinkingId) {
      return;
    }
    speech.stopRecording();
    setInput("");

    if (activeBranchId) {
      void sendBranchToApi(activeBranchId, text);
      return;
    }

    void sendToApi(text);
  }, [
    activeBranchId,
    branchThinkingId,
    input,
    isThinking,
    sendBranchToApi,
    sendToApi,
    speech,
  ]);

  const handleSaveEdit = useCallback(
    async (messageId: string, content: string) => {
      if (!content || isComplete) {
        return;
      }

      setIsSavingEdit(true);
      setErrorMessage(null);
      setCorrectionNotice(null);

      let response: Response;
      try {
        response = await fetch(
          `/api/intake/${encodeURIComponent(token)}/chat/edit`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId, content }),
          },
        );
      } catch {
        setIsSavingEdit(false);
        setErrorMessage("Could not save your edit.");
        return;
      }

      let payload: EditChatMessageResponse & { error?: string };
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        setIsSavingEdit(false);
        setErrorMessage("Received an invalid response.");
        return;
      }

      setIsSavingEdit(false);
      setEditingMessageId(null);

      if (!response.ok) {
        const issueHint =
          "issues" in payload && Array.isArray(payload.issues)
            ? " Check that the message was saved before editing."
            : "";
        setErrorMessage(
          (payload.error ?? "Could not save your edit.") + issueHint,
        );
        return;
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === messageId ? { ...message, content: payload.content } : message,
        ),
      );

      if (!payload.isSignificantChange) {
        setCorrectionNotice(
          payload.acknowledgment ?? "Got it, I've noted that correction.",
        );
        setActiveBranchId(null);
        setOpenBranchIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
        return;
      }

      if (!payload.branch || !payload.parentMessageId) {
        return;
      }

      setBranchMeta((prev) => ({
        ...prev,
        [messageId]: {
          originalContent: payload.originalContent ?? payload.content,
          editedContent: payload.content,
          gatekeeperReason: payload.reason,
        },
      }));
      setBranches((prev) => ({
        ...prev,
        [messageId]: payload.branch!,
      }));
      setOpenBranchIds((prev) => new Set(prev).add(messageId));
      setActiveBranchId(messageId);
      setInput("");
      speech.stopRecording();
    },
    [isComplete, messages, speech, token],
  );

  const handleFinish = useCallback(async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/intake/${encodeURIComponent(token)}/submit`,
        { method: "POST" },
      );
      if (!response.ok) {
        setErrorMessage("Could not submit your intake. Try again.");
        setIsSubmitting(false);
        return;
      }
      window.location.href = `/intake/${encodeURIComponent(token)}/complete`;
    } catch {
      setErrorMessage("Network error while submitting.");
      setIsSubmitting(false);
    }
  }, [token]);

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-canvas">
      <StepTwoChatHeader
        token={token}
        canFinish={isComplete}
        isSubmitting={isSubmitting}
        isThinking={isThinking}
        onFinish={() => void handleFinish()}
      />

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth px-4">
        <StepTwoChatBubbles
          messages={messages}
          branches={branches}
          openBranchIds={openBranchIds}
          branchThinkingId={branchThinkingId}
          isMainThinking={isThinking}
          canEdit={!isComplete && !activeBranchId && !isSavingEdit}
          editingMessageId={editingMessageId}
          isSavingEdit={isSavingEdit}
          onStartEdit={setEditingMessageId}
          onCancelEdit={() => setEditingMessageId(null)}
          onSaveEdit={(messageId, content) => void handleSaveEdit(messageId, content)}
          correctionNotice={correctionNotice}
          activeBranchId={activeBranchId}
          branchInput={input}
          onBranchInputChange={setInput}
          onBranchSend={handleSend}
          branchInputDisabled={inputDisabled}
          branchSpeech={speech}
          branchInputRef={branchInputRef}
        />
        <div ref={scrollAnchorRef} className="h-px shrink-0" aria-hidden />
      </main>

      {errorMessage ? (
        <p
          role="alert"
          className="shrink-0 px-4 pb-2 text-center text-sm text-danger"
        >
          {errorMessage}
        </p>
      ) : null}

      {isComplete || !activeBranchId ? (
        <StepTwoChatInputBar
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onFinish={() => void handleFinish()}
          inputDisabled={inputDisabled}
          isComplete={isComplete}
          isSubmitting={isSubmitting}
          speech={speech}
        />
      ) : null}
    </div>
  );
}
