/** Patient-visible kickoff — not counted toward the friction budget. */
export const INTAKE_CHAT_KICKOFF_MESSAGE = "I am ready for follow-up questions.";

/** Model appends this when the interview should end (PHI-free marker). */
export const INTAKE_CHAT_COMPLETE_MARKER = "[INTAKE_COMPLETE]";

/** Step 2 chat friction budget: up to 10 assistant questions + 10 patient replies. */
export const INTAKE_CHAT_MAX_USER_TURNS = 10;
export const INTAKE_CHAT_MAX_ASSISTANT_TURNS = 10;
/** Kickoff row + 10 assistant + 10 user replies. */
export const INTAKE_CHAT_MAX_TOTAL_MESSAGES = 21;

/** Minimum assistant questions before the model may close the interview. */
export const INTAKE_CHAT_MIN_ASSISTANT_TURNS_BEFORE_COMPLETE = 8;

/** Detects the scripted closing line (PHI-free fingerprint). */
export const INTAKE_CHAT_FINISH_PROMPT_FINGERPRINT =
  "tap the Finish button below to complete your intake";

/** Nested edit follow-up thread may close early (1–2 questions). */
export const INTAKE_CHAT_BRANCH_COMPLETE_MARKER = "[INTAKE_BRANCH_COMPLETE]";
export const INTAKE_CHAT_BRANCH_MAX_USER_TURNS = 2;
export const INTAKE_CHAT_MINOR_EDIT_ACKNOWLEDGMENT =
  "Got it, I've noted that correction.";
