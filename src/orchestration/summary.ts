import { generateText } from "ai";
import { model } from "../_internal/setup";
import { SectionOutcome } from "./types";

export function buildFallbackSummary(outcomes: SectionOutcome[]): string {
  const parts = outcomes.map((o) => {
    if (o.resolution === "skipped") {
      return `${o.sectionLabel} - Skipped`;
    }
    const resolutionText =
      o.resolution === "deterministic"
        ? "Pass (deterministic)"
        : o.resolution === "ai"
          ? "Fixed with AI"
          : "Fixed with HUMAN";
    const fieldsNote =
      o.failingFields && o.failingFields.length > 0
        ? ` [${o.failingFields.join(", ")} needed correction]`
        : "";
    return `${o.sectionLabel} - ${resolutionText}${fieldsNote}`;
  });
  return `Run Completed: ${parts.join("; ")}.`;
}

export async function generateRunSummaryWithAI(outcomes: SectionOutcome[]): Promise<string> {
  const fallback = buildFallbackSummary(outcomes);
  const payload = outcomes
    .map((o) => {
      if (o.resolution === "skipped") return `${o.sectionLabel}: skipped`;
      const fields =
        o.failingFields && o.failingFields.length > 0
          ? ` — fields corrected: ${o.failingFields.join(", ")}`
          : "";
      return `${o.sectionLabel}: ${o.resolution}${fields}`;
    })
    .join("\n");

  const result = await generateText({
    model,
    system: `You write concise 2-3 sentence summaries of healthcare form-fill automation runs.
Resolution types: "deterministic" = filled automatically with no issues; "ai" = AI successfully corrected bad/ambiguous input and filled the field; "human" = required manual intervention; "skipped" = section omitted because no data was provided.
Frame AI recovery as a positive outcome (the system handled it), not as a problem. Do not use phrases like "encountered issues" or "received ai inputs". Be factual and specific about which fields were corrected.`,
    prompt: `Summarise this form-fill run in 2-3 sentences:\n${payload}`,
  });

  const text = result.text?.trim();
  return text && text.length > 0 ? text : fallback;
}
