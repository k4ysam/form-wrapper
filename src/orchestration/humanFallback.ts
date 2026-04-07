import * as readline from "readline";
import { FIELD_HINTS, FIELD_LABELS, parseFailingField, SECTION_LABELS } from "./fieldMeta";

/**
 * Pauses execution and prompts the human to resolve failing fields in the browser,
 * then waits for Enter to hand control back to the agent.
 *
 * @param section       Internal section key (e.g. "personalInfo")
 * @param failingFields Array of checkpoint failing-field strings to display
 * @param context       Optional one-line explanation of why this prompt appeared
 */
export async function humanFallback(
  section: string,
  failingFields: string[],
  context?: string
): Promise<void> {
  const sectionLabel = SECTION_LABELS[section] ?? section;

  console.warn(`\n${"─".repeat(60)}`);
  console.warn(`[orchestrator] HUMAN-IN-THE-LOOP REQUIRED`);
  console.warn(`  Section : ${sectionLabel}`);

  if (failingFields.length > 0) {
    console.warn(`\n  The following fields need attention:\n`);
    for (const entry of failingFields) {
      const parsed = parseFailingField(entry);
      if (parsed) {
        const { selector, expected, actual } = parsed;
        const label = FIELD_LABELS[selector] ?? selector;
        const hint  = FIELD_HINTS[selector];
        console.warn(`    • ${label}  (${selector})`);
        console.warn(`        Expected : "${expected}"`);
        console.warn(`        Actual   : "${actual}"`);
        if (hint) console.warn(`        Hint     : ${hint}`);
        console.warn("");
      } else {
        // Entry didn't match the standard format — print as-is
        console.warn(`    • ${entry}`);
        console.warn("");
      }
    }
  }

  if (context) {
    console.warn(`  Context  : ${context}`);
  }

  console.warn(`  Please fix the fields above in the browser, then press Enter.`);
  console.warn(`${"─".repeat(60)}\n`);

  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Press Enter once you have resolved the issue to continue the workflow: ", () => {
      rl.close();
      resolve();
    });
  });
}
