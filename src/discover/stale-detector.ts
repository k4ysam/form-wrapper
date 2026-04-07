import { Page } from "playwright";
import { WorkflowConfig } from "../workflow-loader/types";

export interface StaleField {
  fieldId: string;
  selector: string;
  reason: "not_found";
}

/**
 * Checks each field selector in the workflow config against the live DOM.
 * Returns any selectors that resolve to zero elements.
 *
 * Skipped entirely for workflows with discovered: 'partial' — multi-step
 * forms may legitimately hide fields that aren't yet visible.
 */
export async function detectStaleSelectors(
  page: Page,
  config: WorkflowConfig
): Promise<StaleField[]> {
  if (config.discovered === "partial") return [];

  const stale: StaleField[] = [];

  for (const section of config.sections) {
    if (!section.fields) continue;
    for (const field of section.fields) {
      if (field.unsupported) continue;
      const count = await page.locator(field.selector).count();
      if (count === 0) {
        stale.push({ fieldId: field.id, selector: field.selector, reason: "not_found" });
      }
    }
  }

  return stale;
}
