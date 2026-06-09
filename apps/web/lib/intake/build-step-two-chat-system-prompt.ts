import {
  INTAKE_CHAT_COMPLETE_MARKER,
  INTAKE_CHAT_MAX_ASSISTANT_TURNS,
  INTAKE_CHAT_MIN_ASSISTANT_TURNS_BEFORE_COMPLETE,
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
  const mayClose =
    isFinalTurn || input.assistantTurn >= INTAKE_CHAT_MIN_ASSISTANT_TURNS_BEFORE_COMPLETE;
  const closingLine = buildIntakeChatClosingMessage(input.patientFirstName).replace(
    `\n\n${INTAKE_CHAT_COMPLETE_MARKER}`,
    "",
  );

  const depthRule = mayClose
    ? `- You have met the minimum depth (${INTAKE_CHAT_MIN_ASSISTANT_TURNS_BEFORE_COMPLETE}+ questions). You may close when you have a comprehensive clinical picture, using the closing sentence below.`
    : `- You are still building depth (turn ${input.assistantTurn} of at least ${INTAKE_CHAT_MIN_ASSISTANT_TURNS_BEFORE_COMPLETE} required questions). DO NOT close the interview. DO NOT append ${INTAKE_CHAT_COMPLETE_MARKER}. Ask your next single follow-up question.`;

  return `${base}

## Session state (authoritative)
- This is assistant turn ${input.assistantTurn} of ${INTAKE_CHAT_MAX_ASSISTANT_TURNS} (target interview depth: 8–10 distinct questions).
- You are a thorough clinical investigator. Conduct a deep interview; do not stop after surface-level answers.
- Ask exactly one follow-up question per reply unless you are on a mandatory closing turn.
- When exploring a symptom, ask about chronicity, severity, alleviating/aggravating factors, and related bodily systems before changing topics.
${depthRule}
- DO NOT invoke completion (closing sentence or ${INTAKE_CHAT_COMPLETE_MARKER}) until you have asked at least ${INTAKE_CHAT_MIN_ASSISTANT_TURNS_BEFORE_COMPLETE} follow-up questions, except on the final allowed turn.
- When closing, say exactly this sentence and nothing else before it: "${closingLine}"
- After that closing sentence, append the token ${INTAKE_CHAT_COMPLETE_MARKER} on its own line.
${isFinalTurn ? `- This is the final allowed assistant turn. You must close now; do not ask a new question.` : ""}`;
}
