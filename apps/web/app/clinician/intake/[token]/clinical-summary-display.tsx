const SECTION_HEADING = /^##\s+(.+)$/;

type SummarySection = {
  title: string;
  body: string;
};

function parseClinicalSummary(markdown: string): SummarySection[] {
  const lines = markdown.split("\n");
  const sections: SummarySection[] = [];
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

type ClinicalSummaryDisplayProps = {
  clinicalSummary: string;
};

export function ClinicalSummaryDisplay({
  clinicalSummary,
}: ClinicalSummaryDisplayProps) {
  const sections = parseClinicalSummary(clinicalSummary);

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <section key={section.title}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            {section.title}
          </h3>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
            {section.body || (
              <span className="text-ink-faint italic">No content for this section.</span>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
