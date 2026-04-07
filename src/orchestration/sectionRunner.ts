import { Page } from "playwright";
import { AuditLogger } from "../logger";
import { CheckResult } from "../workflow/types";
import { RunBudget } from "./budget";
import { FIELD_LABELS, SECTION_LABELS, getErrorHint, parseFailingField } from "./fieldMeta";
import { humanFallback } from "./humanFallback";
import { HandoffContext, SectionOutcome } from "./types";

/**
 * Runs a section through the 3-tier pipeline:
 *   Tier 1 — deterministic engine (0 LLM calls on success)
 *   Tier 2 — checkpoint -> AI sub-agent with hint (budget-capped)
 *   Tier 3 — human-in-the-loop
 */
export async function runSectionWithFallback(opts: {
  section: string;
  page: Page;
  logger: AuditLogger;
  budget: RunBudget;
  runDeterministic: () => Promise<void>;
  runCheckpoint: () => Promise<CheckResult>;
  runAiAgent: (hint: string) => Promise<HandoffContext>;
}): Promise<SectionOutcome> {
  const { section, page, logger, budget, runDeterministic, runCheckpoint, runAiAgent } = opts;
  const sectionLabel = SECTION_LABELS[section] ?? section;

  // Tier 1: deterministic
  try {
    await runDeterministic();
  } catch (detErr) {
    logger.record("orchestrator", "deterministic:fail", {
      section,
      error: (detErr as Error).message,
    });
    // Fall through — checkpoint will measure actual DOM state below
  }

  const { valid, failingFields } = await runCheckpoint();
  const errorHint = getErrorHint(failingFields);
  // Human-readable field labels stored on SectionOutcome for accurate summaries.
  const failingFieldLabels = failingFields.map((f) => {
    const parsed = parseFailingField(f);
    return parsed ? (FIELD_LABELS[parsed.selector] ?? parsed.selector) : f;
  });

  if (valid) {
    logger.record("orchestrator", "checkpoint:pass", { section });
    console.log(`[orchestrator] PASS  "${section}" (deterministic)`);
    return { section, sectionLabel, resolution: "deterministic" };
  }

  logger.record("orchestrator", "checkpoint:fail", { section, failingFields });
  console.warn(`[orchestrator] FAIL  "${section}" checkpoint — ${failingFields.join(" | ")}`);

  // Tier 2: AI sub-agent with hint
  let aiFailReason: string | undefined;

  if (budget.available()) {
    budget.consume();
    const hint = `These fields have wrong or missing values: ${failingFields.join(", ")}`;
    logger.record("orchestrator", "ai:invoke", { section, hint, budgetStatus: budget.status });
    console.log(`[orchestrator] AI    "${section}" — ${budget.status}`);

    const ctx = await runAiAgent(hint);

    if (ctx.success) {
      // Lenient post-AI check: verify the previously-failing fields are now non-empty.
      // We do NOT re-run the strict checkpoint because the AI may have filled a field
      // with a valid value that differs from the original bad input (e.g. "1985-03-02"
      // for "2 March 1985"). The strict check would incorrectly flag that as a failure.
      const stillEmpty: string[] = [];
      for (const entry of failingFields) {
        const parsed = parseFailingField(entry);
        if (!parsed) continue;
        try {
          const val = await page.inputValue(parsed.selector);
          if (!val || val.trim() === "") stillEmpty.push(parsed.selector);
        } catch {
          // selector might be a <select> — try evaluate
          try {
            const val: string = await page.locator(parsed.selector).evaluate(
              (el: HTMLSelectElement) => el.value ?? ""
            );
            if (!val || val.trim() === "") stillEmpty.push(parsed.selector);
          } catch {
            stillEmpty.push(parsed.selector); // can't read → treat as empty
          }
        }
      }

      if (stillEmpty.length === 0) {
        logger.record("orchestrator", "ai:pass", { section });
        console.log(`[orchestrator] PASS  "${section}" (AI recovery, fields non-empty confirmed)`);
        return { section, sectionLabel, resolution: "ai", errorHint, failingFields: failingFieldLabels };
      }
      // Agent ran but some fields are still empty — treat as ai:fail
      aiFailReason = `AI ran but fields still empty: ${stillEmpty.join(", ")}`;
      logger.record("orchestrator", "ai:fail", { section, error: aiFailReason });
      console.warn(`[orchestrator] FAIL  "${section}" AI recovery — ${aiFailReason}`);
    } else {
      aiFailReason = ctx.error;
      logger.record("orchestrator", "ai:fail", { section, error: ctx.error });
      console.warn(`[orchestrator] FAIL  "${section}" AI recovery — ${ctx.error}`);
    }
  } else {
    logger.record("orchestrator", "ai:skipped", { section, reason: "budget exhausted" });
    console.warn(`[orchestrator] SKIP  "${section}" AI — budget exhausted (${budget.status})`);
  }

  // Tier 3: human-in-the-loop (first attempt)
  // Build a specific reason so the human understands exactly why they're being asked to intervene.
  let context: string;
  if (!budget.available() && !aiFailReason) {
    context = `The LLM budget has been exhausted (${budget.status}) — automated recovery is not possible. Please fix the highlighted fields directly in the browser.`;
  } else if (aiFailReason && (aiFailReason.includes("quota") || aiFailReason.includes("rate"))) {
    context = `The AI hit its API quota and could not recover automatically. Please fix the highlighted fields directly in the browser.`;
  } else if (aiFailReason) {
    const shortReason = aiFailReason.split("\n")[0].trim();
    context = `AI recovery failed: ${shortReason}. Please fix the highlighted fields directly in the browser.`;
  } else {
    context = `Automated recovery was skipped (budget exhausted: ${budget.status}). Please fix the highlighted fields directly in the browser.`;
  }

  await humanFallback(section, failingFields, context);
  logger.record("orchestrator", "human:resolved", { section });

  // Re-run the checkpoint after human intervention.
  // IMPORTANT: we only care about fields that are still EMPTY (got "").
  // If a field has any value — even one that differs from the SOP expected value —
  // the human resolved it. We don't penalise them for entering a valid date when the
  // queued expected value itself was in the wrong format (e.g. "15/01/1990" vs "1990-01-15").
  const postHuman = await runCheckpoint();

  // Filter to only fields that are genuinely still empty after human intervention.
  const stillEmpty = postHuman.failingFields.filter((entry) => entry.includes('got ""'));

  if (stillEmpty.length === 0) {
    logger.record("orchestrator", "post-human:pass", { section });
    console.log(`[orchestrator] PASS  "${section}" (post-human verification)`);
    return { section, sectionLabel, resolution: "human", errorHint, failingFields: failingFieldLabels };
  }

  logger.record("orchestrator", "post-human:still-failing", { section, failingFields: stillEmpty });
  console.warn(
    `[orchestrator] WARN  "${section}" fields still empty after human intervention: ${stillEmpty.join(" | ")}`
  );

  // Give the AI one final attempt — only for genuinely empty fields, not bad-format ones.
  if (budget.available()) {
    budget.consume();
    const remainingHint = `After human intervention, these fields are still empty: ${stillEmpty.join(", ")}`;
    logger.record("orchestrator", "ai:invoke", { section, hint: remainingHint, budgetStatus: budget.status });
    console.log(`[orchestrator] AI    "${section}" (post-human fix) — ${budget.status}`);

    const ctx = await runAiAgent(remainingHint);
    if (ctx.success) {
      logger.record("orchestrator", "post-human-ai:pass", { section });
      console.log(`[orchestrator] PASS  "${section}" (AI fix after human)`);
      return { section, sectionLabel, resolution: "human", errorHint, failingFields: failingFieldLabels };
    }
    logger.record("orchestrator", "post-human-ai:fail", { section, error: ctx.error });
    console.warn(`[orchestrator] FAIL  "${section}" post-human AI — ${ctx.error}`);
  }

  // Final human prompt: only show the fields that are still empty
  await humanFallback(
    section,
    stillEmpty,
    "These fields are still empty after your previous fix. Please fill them in the browser."
  );
  logger.record("orchestrator", "human:final-resolved", { section });
  return { section, sectionLabel, resolution: "human", errorHint };
}
