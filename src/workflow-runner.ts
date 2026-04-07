import * as path from "path";
import { createSession } from "./session";
import { runOrchestrator } from "./orchestration";
import { loadWorkflow } from "./workflow-loader/loader";
import { adaptToWorkflowInput } from "./workflow-loader/adapter";
import { WorkflowRunResult } from "./api/queue";
import { WorkflowInput } from "./workflow/types";

const WORKFLOWS_DIR = process.env.WORKFLOWS_DIR ?? "./workflows";

/**
 * Runs a workflow end-to-end:
 *   1. Load + validate the workflow YAML
 *   2. Adapt request body into WorkflowInput via template resolution
 *   3. Open browser, navigate to form URL
 *   4. Run the 3-tier orchestrator
 *   5. Optionally check success_selector for result extraction
 *   6. Return a WorkflowRunResult
 */
export async function runWorkflow(
  workflowName: string,
  requestBody: Record<string, unknown>
): Promise<WorkflowRunResult> {
  const start = Date.now();
  const filePath = path.join(WORKFLOWS_DIR, `${workflowName}.yaml`);

  const config = await loadWorkflow(filePath);
  const adaptedInput: WorkflowInput = adaptToWorkflowInput(config, requestBody);

  const { page, context } = await createSession(config.url, { headed: false });

  try {
    const summary = await runOrchestrator(page, adaptedInput);

    // Check success_selector from the submit section if defined
    const submitSection = config.sections.find((s) => s.type === "submit");
    const successSelector = submitSection?.success_selector;

    let status: WorkflowRunResult["status"] = "success";
    let message = summary;

    if (successSelector) {
      const found = await page.locator(successSelector).count();
      if (found > 0) {
        message = (await page.locator(successSelector).first().textContent()) ?? summary;
        status = "success";
      } else {
        // Heuristic: URL changed after submit = likely success
        const currentUrl = page.url();
        if (currentUrl !== config.url) {
          status = "success";
          message = "URL changed after submit";
        } else {
          status = "ambiguous";
          message = "No confirmation detected";
        }
      }
    }

    return {
      runId: workflowName,
      status,
      message,
      tiersUsed: extractTiersFromSummary(summary),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      runId: workflowName,
      status: "failed",
      message: (err as Error).message,
      tiersUsed: [],
      durationMs: Date.now() - start,
    };
  } finally {
    await context.browser()?.close();
  }
}

function extractTiersFromSummary(summary: string): string[] {
  const tiers: string[] = [];
  if (/deterministic/i.test(summary)) tiers.push("deterministic");
  if (/ai|llm/i.test(summary)) tiers.push("ai_recovery");
  if (/human/i.test(summary)) tiers.push("human_fallback");
  return tiers.length > 0 ? tiers : ["deterministic"];
}
