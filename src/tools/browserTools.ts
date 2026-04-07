import { tool } from "ai";
import { Page } from "playwright";
import { z } from "zod";

/**
 * Creates a set of browser interaction tools scoped to the given Playwright page.
 * Each agent receives only the subset of tools it needs to complete its task —
 * keeping context tight and reducing the chance of the model taking unexpected actions.
 */
export function createBrowserTools(page: Page) {
  const takeScreenshot = tool({
    description:
      "Observe the current state of the page. Returns the current URL, all visible labels/headings/buttons, and the current value of every form field. Call this before and after every action to verify results.",
    parameters: z.object({}),
    execute: async () => {
      const url = page.url();

      const formValues: Record<string, string> = await page.evaluate(() => {
        const result: Record<string, string> = {};
        document
          .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input, select, textarea"
          )
          .forEach((el) => {
            const key = el.id || el.name;
            if (key) result[key] = el.value;
          });
        return result;
      });

      const visibleLabels: string[] = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h1,h2,h3,label,button,p"))
          .map((el) => (el as HTMLElement).innerText.trim())
          .filter(Boolean)
      );

      return JSON.stringify({ url, formValues, visibleLabels }, null, 2);
    },
  });

  const fillField = tool({
    description: "Fill a text input or textarea with a value using its CSS selector.",
    parameters: z.object({
      selector: z.string().describe("CSS selector targeting the input or textarea (e.g. #firstName)"),
      value: z.string().describe("The value to type into the field"),
    }),
    execute: async ({ selector, value }) => {
      try {
        await page.waitForSelector(selector, { state: "visible", timeout: 5000 });
        await page.fill(selector, value);
        return { success: true, message: `Filled "${selector}" with "${value}"` };
      } catch (err) {
        return { success: false, message: `Failed to fill "${selector}": ${(err as Error).message}` };
      }
    },
  });

  const clickElement = tool({
    description: "Click a button or clickable element using its CSS selector.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the element to click (e.g. button[type='submit'])"),
    }),
    execute: async ({ selector }) => {
      try {
        await page.waitForSelector(selector, { state: "visible", timeout: 5000 });
        await page.locator(selector).scrollIntoViewIfNeeded();
        await page.click(selector);
        await page.waitForTimeout(400);
        return { success: true, message: `Clicked "${selector}"` };
      } catch (err) {
        return { success: false, message: `Failed to click "${selector}": ${(err as Error).message}` };
      }
    },
  });

  const selectOption = tool({
    description: "Select an option from a <select> dropdown by its visible label text. Matching is case-insensitive.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the <select> element (e.g. #gender)"),
      label: z.string().describe("Visible label of the option to select (e.g. 'Male', 'O+'). Case-insensitive."),
    }),
    execute: async ({ selector, label }) => {
      try {
        await page.waitForSelector(selector, { state: "visible", timeout: 5000 });

        // Collect all option texts for fallback matching and error messages.
        const allOptions: string[] = await page.locator(selector).evaluate(
          (el: HTMLSelectElement) => Array.from(el.options).map((o) => o.text)
        );

        // Try exact match first, then case-insensitive.
        const matched = allOptions.find(
          (o) => o === label || o.toLowerCase() === label.toLowerCase()
        );

        if (!matched) {
          return {
            success: false,
            message: `No option matching "${label}" found in "${selector}". Valid options are: ${allOptions.join(", ")}`,
          };
        }

        await page.selectOption(selector, { label: matched });
        const selected: string = await page.locator(selector).evaluate(
          (el: HTMLSelectElement) => el.options[el.selectedIndex]?.text ?? ""
        );
        return { success: true, message: `Selected "${selected}" in "${selector}"` };
      } catch (err) {
        return {
          success: false,
          message: `Failed to select "${label}" in "${selector}": ${(err as Error).message}`,
        };
      }
    },
  });

  const scrollTo = tool({
    description: "Scroll an element into the visible viewport before interacting with it.",
    parameters: z.object({
      selector: z.string().describe("CSS selector for the element to scroll into view"),
    }),
    execute: async ({ selector }) => {
      try {
        await page.locator(selector).scrollIntoViewIfNeeded();
        return { success: true, message: `Scrolled "${selector}" into view` };
      } catch (err) {
        return { success: false, message: `Failed to scroll to "${selector}": ${(err as Error).message}` };
      }
    },
  });

  return { takeScreenshot, fillField, clickElement, selectOption, scrollTo };
}

export type BrowserTools = ReturnType<typeof createBrowserTools>;
