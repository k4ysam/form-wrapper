/**
 * Section 3 — Emergency Contact
 *
 * Everything for the Emergency Contact section:
 *   - buildSection3Steps  : deterministic Playwright steps 
 *   - checkSection3       : DOM checkpoint that validates field values 
 *   - runSection3Agent    : AI recovery agent invoked only when the checkpoint fails 
 */

import { generateText } from "ai";
import { Page } from "playwright";
import { model } from "../_internal/setup";
import { Step } from "../engine";
import { AuditLogger } from "../logger";
import { HandoffContext } from "../orchestration/types";
import { createBrowserTools } from "../tools/browserTools";
import { makeFillStep, makeOpenSectionStep } from "../workflow/helpers";
import { CheckResult, WorkflowInput } from "../workflow/types";

// Deterministic steps 

export function buildSection3Steps(input: WorkflowInput): Step[] {
  return [
    makeOpenSectionStep("Emergency Contact", "#emergencyContact"),
    makeFillStep("fillEmergencyContact", ["#emergencyContact", "input[name='emergencyContact']"], () => input.emergencyContact),
    makeFillStep("fillEmergencyPhone",   ["#emergencyPhone",   "input[name='emergencyPhone']"],   () => input.emergencyPhone),
  ];
}

// Checkpoint 

export async function checkSection3(page: Page, input: WorkflowInput): Promise<CheckResult> {
  const failingFields: string[] = []; // list of failing fields

  for (const [selector, value] of [
    ["#emergencyContact", input.emergencyContact],
    ["#emergencyPhone",   input.emergencyPhone],
  ] as const) {
    if (!value) continue;
    try {
      const actual = await page.inputValue(selector); // get the actual value of the field
      if (actual !== value) {
        failingFields.push(`${selector} (expected "${value}", got "${actual}")`); // if the actual value is not the expected value, add it to the list of failing fields
      }
    } catch {
      failingFields.push(`${selector} (field not readable)`); // if the field is not readable, add it to the list of failing fields
    }
  }

  return { valid: failingFields.length === 0, failingFields }; // return the result of the checks
}

// AI recovery agent 

const SYSTEM_PROMPT = `
You are a form-filling sub-agent responsible ONLY for Section 3 — Emergency Contact.

The form URL is provided in the FORM_URL environment variable (this is the only URL you can visit).
The "Emergency Contact" accordion is ALREADY EXPANDED when you are called. Do NOT click it.

Your available tools: fillField, scrollTo.
Do NOT submit the form, do NOT interact with Section 1 or Section 2.

The current page state will be provided in the prompt — you do NOT need to observe first.

Fields in Section 3:
  - #emergencyContact — text input (Emergency Contact Name)
  - #emergencyPhone   — tel input (Emergency Contact Phone)

Your success criteria:
  - #emergencyContact contains the correct name
  - #emergencyPhone contains the correct phone number

Working strategy:
1. Use fillField for #emergencyContact and #emergencyPhone directly.
`.trim();

export async function runSection3Agent(
  page: Page,
  input: WorkflowInput,
  logger: AuditLogger,
  hint?: string
): Promise<HandoffContext> {
  logger.record("section3Agent", "start", { hint });

  const { takeScreenshot, fillField, clickElement, scrollTo } = createBrowserTools(page);

  const hasAnySection3Field = input.emergencyContact || input.emergencyPhone;
  if (!hasAnySection3Field) {
    logger.record("section3Agent", "skip", { reason: "No Section 3 fields provided" });
    return { success: true, section: "emergencyContact", skipped: true };
  }

  // Pre-observe page state so the model's one LLM step goes straight to acting.
  let pageState = "(page state unavailable)";
  try {
    pageState = await takeScreenshot.execute({}, { messages: [], toolCallId: "pre-observe" });
  } catch { /* non-fatal */ }
  logger.record("section3Agent", "pre-observe", { pageState });

  const fieldsPrompt = [
    input.emergencyContact ? `- Emergency Contact Name: "${input.emergencyContact}"` : null,
    input.emergencyPhone   ? `- Emergency Contact Phone: "${input.emergencyPhone}"` : null,
  ].filter(Boolean).join("\n");

  const hintLine = hint
    ? `\nIMPORTANT — the checkpoint detected these specific issues: ${hint}\nFocus only on fixing these fields.`
    : "";

  try {
    const result = await generateText({
      model,
      maxSteps: 1, // API limit: 20/day, 5/min — one request per section fallback
      system: SYSTEM_PROMPT,
      prompt: `Current page state:
${pageState}

Fill Section 3 — Emergency Contact with the following values:
${fieldsPrompt}
${hintLine}
First fill every field listed above. The accordion is already open — do NOT click it.`,
      tools: { fillField, scrollTo },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } } },
      onStepFinish: (step) => { logger.recordStep("section3Agent", step); },
    });

    logger.record("section3Agent", "complete", { finishReason: result.finishReason });
    return { success: true, section: "emergencyContact" };
  } catch (err) {
    const error = (err as Error).message;
    logger.record("section3Agent", "error", { error });
    return { success: false, section: "emergencyContact", error };
  }
}
