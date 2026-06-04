/** Step 1 sections 1–7, 14–16 (legacy intake). Deep dives 8–13 are Step 2 only. */
export const STEP_ONE_SCREENS = [
  { key: "about_you", label: "About you" },
  { key: "why_here", label: "Why you're here" },
  { key: "symptoms", label: "Current symptoms" },
  { key: "history", label: "Health history" },
  { key: "medications", label: "Medications & supplements" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "hormones", label: "Hormones & cycle" },
  { key: "previous_labs", label: "Previous labs" },
  { key: "wearables", label: "Wearables & tracking" },
  { key: "anything_else", label: "Anything else?" },
] as const;

export type StepOneScreenKey = (typeof STEP_ONE_SCREENS)[number]["key"];
