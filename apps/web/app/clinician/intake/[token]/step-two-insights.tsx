import { Badge } from "@/components/ui/badge";
import {
  formatQuestionAnswer,
  UNANSWERED_LABEL,
} from "@/lib/intake/format-question-answer";
import type { IntakeData } from "@/lib/intake/schemas/intake-data.schema";
import type { IdentifiedIssue, Question } from "@/lib/intake/schemas/question-plan.schema";
import {
  buildFlatSteps,
  extractStepTwoAnswers,
  extractStepTwoPlan,
  MODULE_LABELS,
  type StepTwoFlatStep,
} from "@/lib/intake/step-two-storage";

function QuestionAnswerRow({
  prompt,
  helpText,
  answer,
  required,
}: {
  prompt: string;
  helpText?: string;
  answer: string;
  required: boolean;
}) {
  const unanswered = answer === UNANSWERED_LABEL;

  return (
    <article className="rounded-md border border-line bg-surface-sunken px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium text-ink">{prompt}</p>
        {required ? (
          <Badge tone="neutral" className="shrink-0">
            Required
          </Badge>
        ) : null}
      </div>
      {helpText ? <p className="mt-1 text-xs text-ink-muted">{helpText}</p> : null}
      <p
        className={`mt-3 whitespace-pre-wrap text-sm ${
          unanswered ? "text-ink-faint italic" : "text-ink"
        }`}
      >
        {answer}
      </p>
    </article>
  );
}

function ModuleBlock({
  moduleLabel,
  rationale,
  steps,
  answers,
}: {
  moduleLabel: string;
  rationale: string;
  steps: StepTwoFlatStep[];
  answers: Record<string, unknown>;
}) {
  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-5 py-4 sm:px-6">
        <h3 className="text-base font-medium text-ink">{moduleLabel}</h3>
        <p className="mt-1 text-sm text-ink-muted">{rationale}</p>
      </header>
      <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
        {steps.map((step) => {
          const formatted =
            formatQuestionAnswer(step.question, answers[step.question.id]) ??
            UNANSWERED_LABEL;

          return (
            <QuestionAnswerRow
              key={step.question.id}
              prompt={step.question.prompt}
              helpText={step.question.help_text}
              answer={formatted}
              required={step.question.required}
            />
          );
        })}
      </div>
    </section>
  );
}

function ScreeningBlock({
  questions,
  answers,
}: {
  questions: Question[];
  answers: Record<string, unknown>;
}) {
  if (questions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-danger bg-surface">
      <header className="border-b border-line px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-medium text-ink">Red-flag screening</h3>
          <Badge tone="danger">Safety</Badge>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Additional questions triggered by intake signals.
        </p>
      </header>
      <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
        {questions.map((question) => {
          const formatted =
            formatQuestionAnswer(question, answers[question.id]) ?? UNANSWERED_LABEL;

          return (
            <QuestionAnswerRow
              key={question.id}
              prompt={question.prompt}
              helpText={question.help_text}
              answer={formatted}
              required={question.required}
            />
          );
        })}
      </div>
    </section>
  );
}

function IdentifiedIssuesBlock({ issues }: { issues: IdentifiedIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-line bg-surface">
      <header className="border-b border-line px-5 py-3 sm:px-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Identified focus areas
        </h3>
      </header>
      <ul className="flex flex-col gap-2 px-5 py-4 sm:px-6">
        {issues.map((issue) => (
          <li
            key={issue.id}
            className="flex flex-wrap items-center gap-2 text-sm text-ink"
          >
            <span className="font-medium">{issue.label}</span>
            {issue.red_flag ? <Badge tone="danger">Red flag</Badge> : null}
            <span className="text-xs text-ink-subtle">({issue.signal_source})</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type StepTwoInsightsProps = {
  intakeData: IntakeData;
};

export function StepTwoInsights({ intakeData }: StepTwoInsightsProps) {
  const plan = extractStepTwoPlan(intakeData.step_two);
  const answers = extractStepTwoAnswers(intakeData.step_two);

  if (!plan) {
    return (
      <section className="rounded-lg border border-line bg-surface px-5 py-8 text-center sm:px-6">
        <p className="text-sm text-ink-muted">
          Step 2 has not been analyzed yet. The dynamic question plan will appear here
          after the patient completes Step 1 and analysis runs.
        </p>
      </section>
    );
  }

  const flatSteps = buildFlatSteps(plan);
  const modulesByKey = new Map<string, StepTwoFlatStep[]>();

  for (const step of flatSteps) {
    const existing = modulesByKey.get(step.moduleKey) ?? [];
    existing.push(step);
    modulesByKey.set(step.moduleKey, existing);
  }

  const moduleOrder = plan.question_plan.map((module) => module.module_key);

  return (
    <div className="flex flex-col gap-5">
      <IdentifiedIssuesBlock issues={plan.identified_issues} />

      {moduleOrder.map((moduleKey) => {
        const steps = modulesByKey.get(moduleKey);
        if (!steps || steps.length === 0) {
          return null;
        }

        const modulePlan = plan.question_plan.find(
          (module) => module.module_key === moduleKey,
        );
        if (!modulePlan) {
          return null;
        }

        return (
          <ModuleBlock
            key={moduleKey}
            moduleLabel={MODULE_LABELS[moduleKey]}
            rationale={modulePlan.rationale}
            steps={steps}
            answers={answers}
          />
        );
      })}

      <ScreeningBlock
        questions={plan.red_flag_screening ?? []}
        answers={answers}
      />

      {plan.analysis_degraded ? (
        <p className="text-sm text-warning">
          Analysis ran in degraded mode — some questions may come from static fallbacks.
        </p>
      ) : null}
    </div>
  );
}
