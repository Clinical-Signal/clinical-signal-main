import { Badge } from "@/components/ui/badge";
import { INTAKE_CHAT_KICKOFF_MESSAGE } from "@/lib/intake/intake-chat-constants";
import { stripCompleteMarker } from "@/lib/intake/intake-chat-markers";
import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";

import { ReviewSection } from "@/app/clinician/intake/[token]/review-primitives";

type PatientIntakeChatTranscriptProps = {
  messages: IntakeChatMessageRow[];
};

function visibleMessages(messages: IntakeChatMessageRow[]): IntakeChatMessageRow[] {
  return messages.filter(
    (message) =>
      !(message.role === "user" && message.content.trim() === INTAKE_CHAT_KICKOFF_MESSAGE),
  );
}

function ChatBubble({ message }: { message: IntakeChatMessageRow }) {
  const { displayText } = stripCompleteMarker(message.content);
  if (!displayText.trim()) {
    return null;
  }

  const isAssistant = message.role === "assistant";

  return (
    <article
      className={`rounded-lg border px-4 py-3 ${
        isAssistant
          ? "border-line bg-surface-sunken"
          : "border-accent/20 bg-accent-soft"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone={isAssistant ? "accent" : "neutral"}>
          {isAssistant ? "Clinical assistant" : "Patient"}
        </Badge>
        <time className="text-xs text-ink-subtle" dateTime={message.createdAt.toISOString()}>
          {message.createdAt.toLocaleString()}
        </time>
      </div>
      <p className="whitespace-pre-wrap text-sm text-ink">{displayText}</p>
    </article>
  );
}

export function PatientIntakeChatTranscript({ messages }: PatientIntakeChatTranscriptProps) {
  const transcript = visibleMessages(messages);

  return (
    <ReviewSection title="Step 2 follow-up conversation">
      {transcript.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No Step 2 chat responses yet. The patient has not started the follow-up
          conversation.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {transcript.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </div>
      )}
    </ReviewSection>
  );
}
