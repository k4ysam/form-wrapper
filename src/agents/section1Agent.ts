/**
 * Section 1 — Personal Information
 *
 * Everything for the Personal Information section:
 *   - buildSection1Steps  : deterministic Playwright steps 
 *   - checkSection1       : DOM checkpoint that validates field values 
 *   - runSection1Agent    : AI recovery agent invoked only when the checkpoint fails 
 */

import { generateText } from "ai";
import { Page } from "playwright";
import { model } from "../_internal/setup";
import { Step } from "../engine";
import { AuditLogger } from "../logger";
import { HandoffContext } from "../orchestration/types";
import { createBrowserTools } from "../tools/browserTools";
import { makeFillStep } from "../workflow/helpers";
import { CheckResult, WorkflowInput } from "../workflow/types";

// Deterministic steps 

export function buildSection1Steps(input: WorkflowInput): Step[] {
  return [
    {
      name: "navigate",
      observe: async () => true, // always return true
      act: async (page) => {
        await page.waitForSelector("#firstName", { timeout: 10000, state: "visible" }); // wait for the first name input to be visible
      },
      verify: async (page) => {
        const visible = await page.locator("#firstName").isVisible(); // check if the first name input is visible
        if (!visible) throw new Error("#firstName is not visible after navigation");
      },
    },
    makeFillStep("fillFirstName", ["#firstName", "input[name='firstName']"], () => input.firstName),
    makeFillStep("fillLastName",  ["#lastName",  "input[name='lastName']"],  () => input.lastName),
    makeFillStep("fillDateOfBirth", ["#dateOfBirth", "input[name='dateOfBirth']"], () => input.dateOfBirth),
    makeFillStep("fillMedicalId",   ["#medicalId",   "input[name='medicalId']"],   () => input.medicalId),
  ];
}

// Checkpoint 

export async function checkSection1(page: Page, input: WorkflowInput): Promise<CheckResult> {
  const failingFields: string[] = []; // list of failing fields

  const checks = [ // list of checks to validate the field values
    { label: "#firstName",   selector: "#firstName",   expected: input.firstName },
    { label: "#lastName",    selector: "#lastName",    expected: input.lastName },
    { label: "#dateOfBirth", selector: "#dateOfBirth", expected: input.dateOfBirth },
    { label: "#medicalId",   selector: "#medicalId",   expected: input.medicalId },
  ];

  for (const { label, selector, expected } of checks) { // validate the field values
    try {
      const actual = await page.inputValue(selector); // get the actual value of the field
      if (actual !== expected) {
        failingFields.push(`${label} (expected "${expected}", got "${actual}")`);
      }
    } catch {
      failingFields.push(`${label} (field not readable)`);
    }
  }

  return { valid: failingFields.length === 0, failingFields }; // return the result of the checks
}

// AI recovery agent 

const SYSTEM_PROMPT = `
You are a form-filling sub-agent responsible ONLY for Section 1 — Personal Information.

The form URL is provided in the FORM_URL environment variable (this is the only URL you can visit).
Section 1 is open by default. You do NOT need to open or close any accordion.

Your available tools: fillField, scrollTo.
Do NOT submit the form, do NOT interact with any other section.

The current page state will be provided to you in the prompt — you do NOT need to observe first.
Your job is to immediately fill each missing or incorrect field using fillField with the exact CSS id selector.

Your success criteria (ALL must be met before you finish):
  - #firstName contains the correct first name
  - #lastName contains the correct last name
  - #dateOfBirth contains the correct date in YYYY-MM-DD format
  - #medicalId contains the correct medical ID
`.trim();

export async function runSection1Agent(
  page: Page,
  input: WorkflowInput,
  logger: AuditLogger,
  hint?: string
): Promise<HandoffContext> {
  logger.record("section1Agent", "start", { hint });

  const { fillField, scrollTo, takeScreenshot } = createBrowserTools(page);

  // Pre-observe page state so the model's one LLM step goes straight to acting.
  let pageState = "(page state unavailable)";
  try {
    pageState = await takeScreenshot.execute({}, { messages: [], toolCallId: "pre-observe" });
  } catch { /* non-fatal — model will still attempt to fill */ }
  logger.record("section1Agent", "pre-observe", { pageState });

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

Fill Section 1 — Personal Information with the following values:
- First Name: "${input.firstName}"
- Last Name: "${input.lastName}"
- Date of Birth: "${input.dateOfBirth}"
- Medical ID: "${input.medicalId}"
${hintLine}
Fill every incorrect or empty field now using fillField.`,
      tools: { fillField, scrollTo },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } } },
      onStepFinish: (step) => { logger.recordStep("section1Agent", step); },
    });

    logger.record("section1Agent", "complete", { finishReason: result.finishReason });
    return { success: true, section: "personalInfo" };
  } catch (err) {
    const error = (err as Error).message;
    logger.record("section1Agent", "error", { error });
    return { success: false, section: "personalInfo", error };
  }
}
