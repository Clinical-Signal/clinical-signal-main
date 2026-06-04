import {
  INTAKE_CHAT_COMPLETE_MARKER,
  INTAKE_CHAT_MAX_ASSISTANT_TURNS,
} from "./intake-chat-constants";
import { buildIntakeChatClosingMessage } from "./intake-chat-closing";
import { loadStepTwoChatSystemPrompt } from "./load-step-two-chat-prompt";

type BuildStepTwoChatSystemPromptInput = {
  assistantTurn: number;
  patientFirstName: string;
};

export function buildStepTwoChatSystemPrompt(
  input: BuildStepTwoChatSystemPromptInput,
): string {
  const base = loadStepTwoChatSystemPrompt();
  const isFinalTurn = input.assistantTurn >= INTAKE_CHAT_MAX_ASSISTANT_TURNS;
  const closingLine = buildIntakeChatClosingMessage(input.patientFirstName).replace(
    `\n\n${INTAKE_CHAT_COMPLETE_MARKER}`,
    "",
  );

  return `${base}

## Session state (authoritative)
- This is assistant turn ${input.assistantTurn} of ${INTAKE_CHAT_MAX_ASSISTANT_TURNS}.
- Ask at most one follow-up question per reply unless you are closing the interview.
- Once you have uncovered the primary triggers for the patient's main complaints (for example digestive symptoms such as bloating or heartburn, or other dominant issues from Step 1), OR when you are on the final turn (${INTAKE_CHAT_MAX_ASSISTANT_TURNS} of ${INTAKE_CHAT_MAX_ASSISTANT_TURNS}), do not ask another question.
- When closing, say exactly this sentence and nothing else before it: "${closingLine}"
- After that closing sentence, append the token ${INTAKE_CHAT_COMPLETE_MARKER} on its own line.
${isFinalTurn ? `- This is the final allowed assistant turn. You must close now; do not ask a new question.` : ""}`;
}
