import { createSession } from "../session";
import { CrawledField, CrawledForm, CrawlerOptions, FieldType } from "./types";

/**
 * Resolves the best selector for a field following priority order:
 *   1. name attribute  → [name='x']
 *   2. aria-label      → [aria-label='x']
 *   3. data-testid     → [data-testid='x']
 *   4. id              → #id  (only if id does not look auto-generated)
 *   5. scoped CSS      → tagName[type='x'] (last resort)
 */
function resolveSelector(el: {
  tag: string;
  type: string | null;
  id: string | null;
  name: string | null;
  ariaLabel: string | null;
  testId: string | null;
}): string {
  if (el.name) return `[name='${el.name}']`;
  if (el.ariaLabel) return `[aria-label='${el.ariaLabel}']`;
  if (el.testId) return `[data-testid='${el.testId}']`;
  if (el.id && !/^[\d\-]+$/.test(el.id) && !/[0-9a-f]{8}-/.test(el.id)) return `#${el.id}`;
  const base = el.tag.toLowerCase();
  return el.type ? `${base}[type='${el.type}']` : base;
}

export async function crawlForm(url: string, options: CrawlerOptions = {}): Promise<CrawledForm> {
  const { page, context } = await createSession(url, { headed: options.headed });

  try {
    await page.waitForLoadState("networkidle");

    const rawFields = await page.evaluate(() => {
      const results: Array<{
        tag: string;
        type: string | null;
        id: string | null;
        name: string | null;
        ariaLabel: string | null;
        testId: string | null;
        placeholder: string | null;
        required: boolean;
        options: string[] | null;
        labelText: string | null;
      }> = [];

      document.querySelectorAll<HTMLElement>("input, select, textarea").forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const input = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

        const id = input.id || null;
        const name = (input as HTMLInputElement).name || null;
        const type = tag === "input" ? (input as HTMLInputElement).type || "text" : null;
        const ariaLabel = el.getAttribute("aria-label") || null;
        const testId = el.getAttribute("data-testid") || null;
        const placeholder = (input as HTMLInputElement).placeholder || null;
        const required = (input as HTMLInputElement).required ?? false;

        // Resolve label text
        let labelText: string | null = null;
        if (id) {
          const labelEl = document.querySelector(`label[for="${id}"]`);
          if (labelEl) labelText = labelEl.textContent?.trim() || null;
        }
        if (!labelText) {
          const closest = el.closest("label");
          if (closest) labelText = closest.textContent?.trim() || null;
        }
        if (!labelText) labelText = ariaLabel || placeholder;

        // Options for select
        let options: string[] | null = null;
        if (tag === "select") {
          options = Array.from((el as HTMLSelectElement).options)
            .filter((o) => o.value !== "")
            .map((o) => o.text.trim());
        }

        results.push({ tag, type, id, name, ariaLabel, testId, placeholder, required, options, labelText });
      });

      return results;
    });

    const fields: CrawledField[] = rawFields.map((raw, i) => {
      const selector = resolveSelector(raw);
      const rawType = raw.tag === "textarea" ? "textarea" : raw.tag === "select" ? "select" : (raw.type as FieldType) || "text";
      const type: FieldType = [
        "text", "email", "tel", "date", "number", "password",
        "textarea", "select", "checkbox", "radio", "file",
      ].includes(rawType) ? (rawType as FieldType) : "text";

      const field: CrawledField = {
        id: raw.name || raw.id || `field-${i}`,
        type,
        label: raw.labelText || raw.placeholder || `field-${i}`,
        selector,
        required: raw.required,
      };

      if (raw.ariaLabel) field.ariaLabel = raw.ariaLabel;
      if (raw.name) field.nameAttr = raw.name;
      if (raw.options) field.options = raw.options;
      if (type === "file") field.unsupported = true;

      return field;
    });

    // Detect multi-step: look for Next/Continue/Proceed buttons
    const isMultiStep = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, input[type='button'], input[type='submit']"));
      return buttons.some((b) => /next|continue|proceed/i.test(b.textContent || (b as HTMLInputElement).value || ""));
    });

    return { url, fields, isMultiStep };
  } finally {
    await context.browser()?.close();
  }
}
