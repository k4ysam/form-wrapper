import * as path from "path";
import { createSession } from "./session";
import { runOrchestrator } from "./orchestration";
import { loadWorkflow } from "./workflow-loader/loader";
import { adaptToWorkflowInput } from "./workflow-loader/adapter";
import { WorkflowRunResult } from "./api/queue";
import { WorkflowInput } from "./workflow/types";
import { AuditLogger } from "./logger";
import { loadCookies } from "./auth/cookie-store";
import { detectStaleSelectors, StaleField } from "./discover/stale-detector";

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
  const runId = AuditLogger.createRunId();
  const logger = new AuditLogger(runId);
  const filePath = path.join(WORKFLOWS_DIR, `${workflowName}.yaml`);

  logger.record("workflow-runner", "workflow:start", { workflowName, runId });

  const config = await loadWorkflow(filePath);
  const adaptedInput: WorkflowInput = adaptToWorkflowInput(config, requestBody);

  const { page, context } = await createSession(config.url, { headed: false });

  // Load cookies if auth strategy is cookie_jar
  if (config.auth?.strategy === "cookie_jar") {
    const cookies = await loadCookies(workflowName);
    if (cookies) {
      await context.addCookies(cookies);
      await page.reload();
      logger.record("workflow-runner", "auth:cookies_loaded", { workflowName, count: cookies.length });
    } else {
      logger.record("workflow-runner", "auth:cookies_missing", { workflowName });
    }
  }

  // Read CSRF token from DOM if csrf_selector is configured
  if (config.auth?.csrf_selector) {
    const csrfToken = await page.evaluate((sel: string) => {
      const el = document.querySelector<HTMLInputElement>(sel);
      return el?.value ?? null;
    }, config.auth.csrf_selector);
    if (csrfToken) {
      logger.record("workflow-runner", "auth:csrf_read", { workflowName });
      // Token available for injection into submit — stored in adaptedInput extension point
      (adaptedInput as Record<string, unknown>)["_csrfToken"] = csrfToken;
    }
  }

  // Stale detection — before filling, warn on selectors that no longer exist in DOM
  let staleFields: StaleField[] = [];
  try {
    staleFields = await detectStaleSelectors(page, config);
    if (staleFields.length > 0) {
      logger.record("workflow-runner", "stale_config:warn", { workflowName, fields: staleFields });
      console.warn(`[workflow-runner] ${staleFields.length} stale selector(s) detected — continuing run`);
    }
  } catch {
    // Stale detection is best-effort — never fail the run
  }

  try {
    const summary = await runOrchestrator(page, adaptedInput);
    logger.record("workflow-runner", "workflow:complete", { workflowName, runId, summary });

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

    const result: WorkflowRunResult = {
      runId,
      status,
      message,
      tiersUsed: extractTiersFromSummary(summary),
      durationMs: Date.now() - start,
      staleFields: staleFields.length > 0 ? staleFields : undefined,
    };
    logger.record("workflow-runner", "workflow:result", { workflowName, ...result });
    return result;
  } catch (err) {
    logger.record("workflow-runner", "workflow:error", { workflowName, error: (err as Error).message });
    return {
      runId,
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
