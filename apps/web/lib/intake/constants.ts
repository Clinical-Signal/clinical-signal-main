export const FRICTION_BUDGET_DEFAULTS = {
  max_augmented_modules: 4,
  max_questions_per_module: 6,
  max_total_augmented_questions: 18,
} as const;

export const SCHEMA_LIMITS = {
  max_questions_per_module_hard_ceiling: 20,
  max_identified_issues: 20,
  max_red_flag_screening: 10,
  question_prompt_max_chars: 280,
  question_id_pattern: /^[a-z][a-z0-9_]{2,63}$/,
} as const;
