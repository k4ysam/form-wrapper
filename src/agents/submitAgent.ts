/**
 * Submit
 *
 * Everything for the form submission step:
 *   - buildSubmitSteps  : deterministic Playwright steps 
 *   - runSubmitAgent    : AI recovery agent invoked only when the deterministic submit fails 
 *
 * No checkpoint function is needed here — runSubmitAgent verifies success
 * directly against the DOM after clicking Submit.
 */

import { generateText } from "ai";
import { Page } from "playwright";
import { model } from "../_internal/setup";
import { Step } from "../engine";
import { AuditLogger } from "../logger";
import { HandoffContext } from "../orchestration/types";
import { createBrowserTools } from "../tools/browserTools";

// Deterministic steps 

export function buildSubmitSteps(): Step[] {
  return [
    {
      name: "submit",
      observe: async (page) => page.locator("button[type='submit']").isVisible(), // check if the submit button is visible
      act: async (page) => { await page.click("button[type='submit']"); }, // click the submit button
      verify: async (page) => { await page.waitForTimeout(500); }, // wait for 500ms
    },
    {
      name: "verifySuccess",
      observe: async () => true, // always return true
      act: async () => {}, // do nothing
      verify: async (page) => { // verify the success indicator
        try { 
          await page.waitForSelector("text=Form submitted successfully", { timeout: 5000 });
        } catch {
          const submitGone = (await page.locator("button[type='submit']").count()) === 0;
          if (!submitGone) throw new Error("Success indicator not found and submit button still present");
        }
      },
    },
  ];
}

// AI recovery agent 

const SYSTEM_PROMPT = `
You are a form-submission sub-agent. Your ONLY job is to click the Submit button and verify that the form submitted successfully.
The form URL is provided in the FORM_URL environment variable (this is the only URL you can visit).

Your available tools: takeScreenshot, clickElement.
Do NOT fill any fields. Do NOT interact with any form inputs.

Your success criteria (ONE of the following must be true after clicking Submit):
  - A success message appears containing text like "Form submitted successfully", "success", or "thank you"
  - The URL changes away from the form page
  - The Submit button disappears from the page

Working strategy:
1. Call takeScreenshot to confirm the form is ready to submit.
2. Click the Submit button: selector = button[type="submit"]
3. Wait a moment, then call takeScreenshot to check if submission succeeded.
4. If a success indicator is visible, stop — your job is done.
5. If submission failed (button still present, error visible), report the error.
`.trim();

export async function runSubmitAgent(
  page: Page,
  logger: AuditLogger
): Promise<HandoffContext> {
  logger.record("submitAgent", "start");

  const { takeScreenshot, clickElement } = createBrowserTools(page); // create the browser tools

  try {
    const result = await generateText({ // generate the text
      model,
      maxSteps: 1, // API limit: 20/day, 5/min — one request per section fallback
      system: SYSTEM_PROMPT,
      prompt: `The form has been fully filled. Please submit it now and verify success.
Start by calling takeScreenshot to confirm, then click the Submit button.`,
      tools: { takeScreenshot, clickElement },
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 1024, includeThoughts: true } } },
      onStepFinish: (step) => { logger.recordStep("submitAgent", step); }, // record the step
    });

    logger.record("submitAgent", "complete", { finishReason: result.finishReason }); // record the completion

    // Deterministic safety check: verify success indicator independent of what the AI reported
    const successText = await page // verify the success indicator
      .waitForSelector("text=Form submitted successfully", { timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    const submitGone = (await page.locator("button[type='submit']").count()) === 0; // check if the submit button is gone

    if (!successText && !submitGone) {
      const error = "Success indicator not found after submission"; // if the success indicator is not found, return an error
      logger.record("submitAgent", "error", { error });
      return { success: false, section: "submit", error };
    }

    logger.record("submitAgent", "verified", { successText, submitGone }); // record the verification
    return { success: true, section: "submit" };
  } catch (err) {
    const error = (err as Error).message;
    logger.record("submitAgent", "error", { error }); // record the error
    return { success: false, section: "submit", error };
  }
}
