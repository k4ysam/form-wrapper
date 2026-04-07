import { Page } from "playwright";
import { buildSection1Steps, checkSection1, runSection1Agent } from "../agents/section1Agent";
import { buildSection2Steps, checkSection2, runSection2Agent } from "../agents/section2Agent";
import { buildSection3Steps, checkSection3, runSection3Agent } from "../agents/section3Agent";
import { buildSubmitSteps, runSubmitAgent } from "../agents/submitAgent";
import { runEngine } from "../engine";
import { AuditLogger } from "../logger";
import { WorkflowInput } from "../workflow/types";
import { RunBudget } from "./budget";
import { SECTION_LABELS } from "./fieldMeta";
import { humanFallback } from "./humanFallback";
import { runSectionWithFallback } from "./sectionRunner";
import { buildFallbackSummary, generateRunSummaryWithAI } from "./summary";
import { SectionOutcome } from "./types";

/**
 * Top-level orchestrator. Dispatches the 4-section pipeline in sequence,
 * each through its own 3-tier deterministic -> AI -> human fallback chain.
 */
export async function runOrchestrator(page: Page, input: WorkflowInput): Promise<string> {
  const runId = AuditLogger.createRunId();
  const logger = new AuditLogger(runId);
  const budget = new RunBudget(4); // max 4 LLM calls per run (1 per section)

  console.log(`\n[orchestrator] Starting run ${runId}`);
  console.log(`[orchestrator] Input: ${JSON.stringify(input)}`);
  console.log(`[orchestrator] Audit log: logs/run-${runId}.jsonl`);
  console.log(`[orchestrator] LLM budget: ${budget.status}\n`);

  logger.record("orchestrator", "pipeline:start", { input });

  const outcomes: SectionOutcome[] = [];

  // Section 1: Personal Information
  outcomes.push(
    await runSectionWithFallback({
      section: "personalInfo",
      page,
      logger,
      budget,
      runDeterministic: () => runEngine(page, buildSection1Steps(input)),
      runCheckpoint: () => checkSection1(page, input),
      runAiAgent: (hint) => runSection1Agent(page, input, logger, hint),
    })
  );

  // Section 2: Medical Information (skip if no fields provided)
  const hasSection2 = !!(input.gender || input.bloodType || input.allergies || input.medications);
  if (hasSection2) {
    outcomes.push(
      await runSectionWithFallback({
        section: "medicalInfo",
        page,
        logger,
        budget,
        runDeterministic: () => runEngine(page, buildSection2Steps(input)),
        runCheckpoint: () => checkSection2(page, input),
        runAiAgent: (hint) => runSection2Agent(page, input, logger, hint),
      })
    );
  } else {
    logger.record("orchestrator", "skip", { section: "medicalInfo", reason: "no fields provided" });
    console.log(`[orchestrator] SKIP  "medicalInfo" (no fields provided)`);
    outcomes.push({ section: "medicalInfo", sectionLabel: SECTION_LABELS.medicalInfo, resolution: "skipped" });
  }

  // Section 3: Emergency Contact
  // The form requires BOTH fields or NEITHER — submitting with only one filled will block the submit button.
  // If only one is provided, skip the section entirely (leave both empty) and warn the caller.
  const hasSection3 = !!(input.emergencyContact && input.emergencyPhone);
  if (!hasSection3 && (input.emergencyContact || input.emergencyPhone)) {
    const missing  = input.emergencyContact ? "emergencyPhone" : "emergencyContact";
    const provided = input.emergencyContact ? "emergencyContact" : "emergencyPhone";
    console.warn(
      `[orchestrator] WARN  "emergencyContact" — skipping section: "${provided}" was provided but "${missing}" is missing. Both are required; leaving both empty.`
    );
    logger.record("orchestrator", "skip", {
      section: "emergencyContact",
      reason: `incomplete pair: ${provided} provided, ${missing} missing`,
    });
  }
  if (hasSection3) {
    outcomes.push(
      await runSectionWithFallback({
        section: "emergencyContact",
        page,
        logger,
        budget,
        runDeterministic: () => runEngine(page, buildSection3Steps(input)),
        runCheckpoint: () => checkSection3(page, input),
        runAiAgent: (hint) => runSection3Agent(page, input, logger, hint),
      })
    );
  } else {
    logger.record("orchestrator", "skip", { section: "emergencyContact", reason: "no fields provided" });
    console.log(`[orchestrator] SKIP  "emergencyContact" (no fields provided)`);
    outcomes.push({
      section: "emergencyContact",
      sectionLabel: SECTION_LABELS.emergencyContact,
      resolution: "skipped",
    });
  }

  // Submit: deterministic engine + AI sub-agent as fallback
  const submitLabel = SECTION_LABELS.submit;
  try {
    await runEngine(page, buildSubmitSteps());
    logger.record("orchestrator", "deterministic:pass", { section: "submit" });
    console.log(`[orchestrator] PASS  "submit" (deterministic)`);
    outcomes.push({ section: "submit", sectionLabel: submitLabel, resolution: "deterministic" });
  } catch (submitErr) {
    logger.record("orchestrator", "deterministic:fail", {
      section: "submit",
      error: (submitErr as Error).message,
    });
    console.warn(`[orchestrator] FAIL  "submit" deterministic — trying AI`);

    if (budget.available()) {
      budget.consume();
      logger.record("orchestrator", "ai:invoke", { section: "submit", budgetStatus: budget.status });
      const ctx = await runSubmitAgent(page, logger);
      if (!ctx.success) {
        await humanFallback(
          "submit",
          [],
          `AI recovery failed: ${ctx.error ?? "submission failed"}. Please click the Submit button manually.`
        );
        outcomes.push({ section: "submit", sectionLabel: submitLabel, resolution: "human", errorHint: "Submit" });
      } else {
        console.log(`[orchestrator] PASS  "submit" (AI recovery)`);
        outcomes.push({ section: "submit", sectionLabel: submitLabel, resolution: "ai", errorHint: "Submit" });
      }
    } else {
      await humanFallback(
        "submit",
        [],
        `LLM budget exhausted (${budget.status}). Please click the Submit button manually. Error: ${(submitErr as Error).message}`
      );
      outcomes.push({ section: "submit", sectionLabel: submitLabel, resolution: "human", errorHint: "Submit" });
    }
  }

  logger.record("orchestrator", "pipeline:end", { budgetStatus: budget.status });
  console.log(`\n[orchestrator] Run complete. ${budget.status}. Audit log: logs/run-${runId}.jsonl`);

  const fallbackSummary = buildFallbackSummary(outcomes);
  let summary: string;
  try {
    summary = await generateRunSummaryWithAI(outcomes);
  } catch {
    summary = fallbackSummary;
  }
  logger.record("orchestrator", "run:summary", { summary });
  return summary;
}
