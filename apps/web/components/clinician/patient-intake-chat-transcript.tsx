import type { IntakeChatMessageRow } from "@/lib/intake/intake-chat-store";
import { NOT_PROVIDED } from "@/lib/intake/format-step-one-for-display";
import { pairIntakeChatMessages } from "@/lib/intake/pair-intake-chat-messages";

import { ReviewSection } from "@/app/clinician/intake/[token]/review-primitives";

type PatientIntakeChatTranscriptProps = {
  messages: IntakeChatMessageRow[];
};

export function PatientIntakeChatTranscript({ messages }: PatientIntakeChatTranscriptProps) {
  const pairs = pairIntakeChatMessages(messages);

  return (
    <ReviewSection title="Step 2 follow-up conversation">
      {pairs.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No Step 2 chat responses yet. The patient has not started the follow-up
          conversation.
        </p>
      ) : (
        <dl className="flex flex-col gap-4">
          {pairs.map((pair, index) => (
            <article
              key={`${index}-${pair.question.slice(0, 24)}`}
              className="rounded-lg border border-line bg-surface-sunken px-4 py-4"
            >
              <div className="mb-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  Question
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-ink">{pair.question}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                  Answer
                </dt>
                <dd
                  className={`mt-1 whitespace-pre-wrap text-sm ${
                    pair.answer.trim() ? "text-ink" : "text-ink-faint italic"
                  }`}
                >
                  {pair.answer.trim() || NOT_PROVIDED}
                </dd>
              </div>
            </article>
          ))}
        </dl>
      )}
    </ReviewSection>
  );
}
