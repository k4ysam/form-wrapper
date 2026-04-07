/**
 * Section 2 — Medical Information
 *
 * Everything for the Medical Information section:
 *   - buildSection2Steps  : deterministic Playwright steps 
 *   - checkSection2       : DOM checkpoint that validates field values 
 *   - runSection2Agent    : AI recovery agent invoked only when the checkpoint fails 
 */

import { generateText } from "ai";
import { Page } from "playwright";
import { model } from "../_internal/setup";
import { Step } from "../engine";
import { AuditLogger } from "../logger";
import { HandoffContext } from "../orchestration/types";
import { createBrowserTools } from "../tools/browserTools";
import { makeFillStep, makeOpenSectionStep, makeSelectStep } from "../workflow/helpers";
import { CheckResult, WorkflowInput } from "../workflow/types";

// Deterministic steps 

export function buildSection2Steps(input: WorkflowInput): Step[] {
  return [
    makeOpenSectionStep("Medical Information", "#gender"),
    makeSelectStep("selectGender",    "#gender",    () => input.gender),
    makeSelectStep("selectBloodType", "#bloodType", () => input.bloodType),
    makeFillStep("fillAllergies",   ["#allergies",   "textarea[name='allergies']"],   () => input.allergies),
    makeFillStep("fillMedications", ["#medications", "textarea[name='medications']"], () => input.medications),
  ];
}

// Checkpoint 

export async function checkSection2(page: Page, input: WorkflowInput): Promise<CheckResult> {
  const failingFields: string[] = []; // list of failing fields

  if (input.gender) {
    try {
      const selected: string = await page.locator("#gender").evaluate( // get the selected option
        (el: HTMLSelectElement) => el.options[el.selectedIndex]?.text ?? ""
      );
      // Case-insensitive: makeSelectStep resolves "FEMALE" → "Female", so the
      // selected text will differ from the raw input value by case only — still valid.
      if (selected.toLowerCase() !== input.gender.toLowerCase()) {
        failingFields.push(`#gender (expected "${input.gender}", got "${selected}")`);
      }
    } catch {
      failingFields.push(`#gender (field not readable)`);
    }
  }

  if (input.bloodType) {
    try {
      const selected: string = await page.locator("#bloodType").evaluate( // get the selected option
        (el: HTMLSelectElement) => el.options[el.selectedIndex]?.text ?? ""
      );
      // Same case-insensitive check — "o+" filled as "O+" is still correct.
      if (selected.toLowerCase() !== input.bloodType.toLowerCase()) {
        failingFields.push(`#bloodType (expected "${input.bloodType}", got "${selected}")`);
      }
    } catch {
      failingFields.push(`#bloodType (field not readable)`);
    }
  }

  for (const [selector, value] of [ // validate the field values
    ["#allergies",   input.allergies],
    ["#medications", input.medications],
  ] as const) {
    if (!value) continue; // if the value is not provided, skip the check
    try {
      const actual = await page.inputValue(selector); // get the actual value of the field
      if (actual !== value) {
        failingFields.push(`${selector} (expected "${value}", got "${actual}")`);
      }
    } catch {
      failingFields.push(`${selector} (field not readable)`);
    }
  }

  return { valid: failingFields.length === 0, failingFields }; // return the result of the checks
}

// AI recovery agent 

const SYSTEM_PROMPT = `
You are a form-filling sub-agent responsible ONLY for Section 2 — Medical Information.

The form URL is provided in the FORM_URL environment variable (this is the only URL you can visit).
The "Medical Information" accordion is ALREADY EXPANDED when you are called. Do NOT click it.

Your available tools: fillField, selectOption, scrollTo.
Do NOT submit the form, do NOT interact with Section 1 or Section 3.

The current page state will be provided in the prompt — you do NOT need to observe first.

Fields in Section 2:
  - #gender    — <select> dropdown (options: "Male", "Female", "Other", "Prefer not to say")
  - #bloodType — <select> dropdown (options: "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
  - #allergies  — textarea (free text)
  - #medications — textarea (free text, label is "Current Medications")

IMPORTANT for dropdowns: the input value may be incorrect or ambiguous (e.g. "Meal" instead of "Male",
"O positive" instead of "O+"). Use your judgment to pick the closest valid option. The valid options
are listed above and will also appear in the hint if a mismatch was detected.

Your success criteria:
  - #gender shows the correct selected option
  - #bloodType shows the correct selected option
  - #allergies contains the correct text
  - #medications contains the correct text

Working strategy:
1. Use selectOption for #gender and #bloodType (pick the closest matching option).
2. Use fillField for #allergies and #medications.
`.trim();

export async function runSection2Agent(
  page: Page,
  input: WorkflowInput,
  logger: AuditLogger,
  hint?: string
): Promise<HandoffContext> {
  logger.record("section2Agent", "start", { hint });

  const { takeScreenshot, fillField, clickElement, selectOption, scrollTo } = createBrowserTools(page);

  const hasAnySection2Field = input.gender || input.bloodType || input.allergies || input.medications;
  if (!hasAnySection2Field) {
    logger.record("section2Agent", "skip", { reason: "No Section 2 fields provided" });
    return { success: true, section: "medicalInfo", skipped: true };
  }

  // Pre-observe page state so the model's one LLM step goes straight to acting.
  let pageState = "(page state unavailable)";
  try {
    pageState = await takeScreenshot.execute({}, { messages: [], toolCallId: "pre-observe" });
  } catch { /* non-fatal */ }
  logger.record("section2Agent", "pre-observe", { pageState });

  // When called as recovery (hint present), only include the fields that actually failed.
  // Including already-correct fields causes the AI to re-fill them, risking data corruption
  // (e.g. "SeafoodNone" from allergies value bleeding into medications).
  const failingSelectors = hint
    ? new Set(
        [...hint.matchAll(/(#\w+)/g)].map((m) => m[1])
      )
    : null;

  const allFields: Array<[string, string | undefined, string]> = [
    ["#gender",      input.gender,      `- Gender: "${input.gender}"`],
    ["#bloodType",   input.bloodType,   `- Blood Type: "${input.bloodType}"`],
    ["#allergies",   input.allergies,   `- Allergies: "${input.allergies}"`],
    ["#medications", input.medications, `- Current Medications: "${input.medications}"`],
  ];

  const fieldsPrompt = allFields
    .filter(([sel, val]) => val && (!failingSelectors || failingSelectors.has(sel)))
    .map(([, , label]) => label)
    .join("\n");

  const hintLine = hint
    ? `\nIMPORTANT — only interact with the fields listed above. Do NOT touch any other fields. The checkpoint flagged: ${hint}`
    : "";

  try {
    const result = await generateText({
      model,
      maxSteps: 1, // API limit: 20/day, 5/min — one request per section fallback
      system: SYSTEM_PROMPT,
      prompt: `Current page state:
${pageState}

Fix these Section 2 — Medical Information fields:
${fieldsPrompt}
${hintLine}
The accordion is already open — do NOT click it. ONLY touch the fields listed above.`,
      tools: { fillField, selectOption, scrollTo },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } } },
      onStepFinish: (step) => { logger.recordStep("section2Agent", step); },
    });

    logger.record("section2Agent", "complete", { finishReason: result.finishReason });
    return { success: true, section: "medicalInfo" };
  } catch (err) {
    const error = (err as Error).message;
    logger.record("section2Agent", "error", { error });
    return { success: false, section: "medicalInfo", error };
  }
}
