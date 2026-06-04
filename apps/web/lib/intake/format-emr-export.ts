import type {
  SuggestedNextStep,
  SuggestedNextStepCategory,
  SuggestedNextStepPriority,
} from "@/lib/llm/clinical-synthesis.schema";

import type { SynthesisResolved } from "./schemas/synthesis-resolved.schema";

const SECTION_HEADING = /^##\s+(.+)$/;

/** Canonical CC → HPI → ROS order for EMR paste (matches synthesis schema). */
const CLINICAL_SECTION_ORDER: Record<string, number> = {
  "chief complaint": 0,
  "history of present illness (hpi)": 1,
  "review of systems (ros)": 2,
};

function clinicalSectionSortKey(title: string): number {
  return CLINICAL_SECTION_ORDER[title.trim().toLowerCase()] ?? 50;
}

const PRIORITY_ORDER: Record<SuggestedNextStepPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const CATEGORY_LABELS: Record<SuggestedNextStepCategory, string> = {
  labs: "Labs",
  lifestyle: "Lifestyle",
  referral: "Referral",
  follow_up: "Follow-up",
  documentation: "Documentation",
  other: "Other",
};

function headingBlock(title: string): string {
  const upper = title.toUpperCase();
  const rule = "-".repeat(Math.max(upper.length, 28));
  return `${upper}\n${rule}`;
}

function stripInlineMarkdown(line: string): string {
  let text = line;
  text = text.replace(/^#{1,6}\s+/, "");
  text = text.replace(/^>\s?/, "");
  text = text.replace(/^[-*+]\s+/, "• ");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  text = text.replace(/_([^_]+)_/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/^[-*_]{3,}\s*$/, "");
  return text.trimEnd();
}

function isSkippableMarkdownLine(trimmed: string): boolean {
  if (trimmed.startsWith("|") && trimmed.includes("|")) {
    return true;
  }
  if (/^!\[.*\]\(.*\)$/.test(trimmed)) {
    return true;
  }
  if (/^<[^>]+>.*<\/[^>]+>$/.test(trimmed)) {
    return true;
  }
  return false;
}

function plainifyMarkdownBody(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      output.push(raw);
      continue;
    }

    if (isSkippableMarkdownLine(trimmed)) {
      continue;
    }

    const cleaned = stripInlineMarkdown(raw);
    if (cleaned.length === 0 && output.at(-1) === "") {
      continue;
    }

    output.push(cleaned);
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseSummarySections(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.split("\n");
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle: string | null = null;
  let bodyLines: string[] = [];

  const flush = () => {
    if (!currentTitle) {
      return;
    }
    sections.push({
      title: currentTitle,
      body: bodyLines.join("\n").trim(),
    });
    bodyLines = [];
  };

  for (const line of lines) {
    const match = line.match(SECTION_HEADING);
    if (match?.[1]) {
      flush();
      currentTitle = match[1].trim();
      continue;
    }
    if (currentTitle) {
      bodyLines.push(line);
    }
  }

  flush();

  if (sections.length > 0) {
    return sections;
  }

  return [{ title: "Clinical summary", body: markdown.trim() }];
}

function formatClinicalSummary(clinicalSummary: string): string {
  const sections = [...parseSummarySections(clinicalSummary)].sort(
    (a, b) => clinicalSectionSortKey(a.title) - clinicalSectionSortKey(b.title),
  );
  const blocks = sections.map((section) => {
    const body = plainifyMarkdownBody(section.body);
    return `${headingBlock(section.title)}\n\n${body || "(No content provided.)"}`;
  });

  return blocks.join("\n\n");
}

function formatPriorityLabel(priority: SuggestedNextStepPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function sortNextSteps(steps: SuggestedNextStep[]): SuggestedNextStep[] {
  return [...steps].sort((a, b) => {
    const byPriority = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (byPriority !== 0) {
      return byPriority;
    }
    return a.label.localeCompare(b.label);
  });
}

function formatSuggestedNextSteps(steps: SuggestedNextStep[]): string {
  const sorted = sortNextSteps(steps);
  const lines: string[] = [headingBlock("Suggested next steps"), ""];

  sorted.forEach((step, index) => {
    const category = CATEGORY_LABELS[step.category];
    const priority = formatPriorityLabel(step.priority);
    lines.push(`${index + 1}. ${step.label} [${priority} · ${category}]`);
    lines.push(`   Rationale: ${plainifyMarkdownBody(step.rationale)}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

/**
 * Flattens persisted clinical synthesis into plain text for EMR paste fields.
 */
export function formatForEMR(synthesis: SynthesisResolved): string {
  const header = ["INTAKE CLINICAL SYNTHESIS", "=".repeat(28), ""];

  if (synthesis.generated_at) {
    const when = new Date(synthesis.generated_at);
    if (!Number.isNaN(when.getTime())) {
      header.push(`Generated: ${when.toLocaleString()}`, "");
    }
  }

  const note = formatClinicalSummary(synthesis.clinical_summary);
  const steps = formatSuggestedNextSteps(synthesis.suggested_next_steps);

  return [...header, note, "", steps].join("\n").trim();
}
