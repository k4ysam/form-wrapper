import { Page } from "playwright";
import { Step } from "../engine";

/**
 * Shared step-factory helpers used by every section agent.
 * Exported so each agent file can import only what it needs.
 */


// fill an input or textarea by trying each selector in order.
export async function fillWithFallback(
  page: Page,
  selectors: string[],
  value: string
): Promise<void> {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 2000, state: "visible" });
      await page.fill(selector, value); 
      return; 
    } catch {
      // try next selector  
    }
  }
  // if all selectors fail, throw an error
  throw new Error(`No selector resolved for value "${value}". Tried: ${selectors.join(", ")}`);
}


// assert that an input or textarea contains the expected value by trying each selector in order.
export async function assertInputValue(
  page: Page,
  selectors: string[],
  expected: string
): Promise<void> {
  for (const selector of selectors) {
    try {
      const actual = await page.inputValue(selector);
      if (actual !== expected) {
        throw new Error(`Expected "${expected}" but got "${actual}" at ${selector}`);
      }
      return;
    } catch (err) {
      if ((err as Error).message.includes("Expected")) throw err;
    }
  }
  throw new Error(`Could not read value from any selector to verify "${expected}"`);
}

// build a Step that fills a text input or textarea.
export function makeFillStep(
  name: string,
  selectors: string[],
  getValue: () => string | undefined
): Step {
  return {
    name,
    observe: async (page) => { // check if the input or textarea is visible
      if (!getValue()) return false; // if the value is not provided, return false
      try {
        await page.waitForSelector(selectors[0], { timeout: 2000, state: "attached" });
        return true; 
      } catch {
        return false; // if the input or textarea is not visible, return false
      }
    },
    act: async (page) => { // fill the input or textarea with the value
      await fillWithFallback(page, selectors, getValue()!);
    },
    verify: async (page) => { // assert that the input or textarea contains the expected value
      await assertInputValue(page, selectors, getValue()!);
    },
  };
}

// build a Step that clicks an accordion button and waits for its content to appear.
export function makeOpenSectionStep(title: string, contentSelector: string): Step {
  return {
    name: `openSection:${title}`, 
    observe: async () => true, // check if the accordion button is visible
    act: async (page) => { // click the accordion button
      const btn = page.getByRole("button", { name: title });
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      await page.waitForTimeout(300);
    },
    verify: async (page) => { // assert that the accordion content is visible
      await page.waitForSelector(contentSelector, { state: "visible", timeout: 4000 });
    },
  };
}

// build a Step that selects an option from a <select> by its visible label text.
// Matching is case-insensitive: "MALE" -> "Male", "o+" -> "O+", etc.
export function makeSelectStep(
  name: string,
  selector: string,
  getValue: () => string | undefined
): Step {
  return {
    name,
    observe: async (page) => {
      if (!getValue()) return false;
      try {
        await page.waitForSelector(selector, { timeout: 2000, state: "visible" });
        return true;
      } catch {
        return false;
      }
    },
    act: async (page) => {
      const raw = getValue()!;
      // Collect all option texts and find a case-insensitive match.
      const allOptions: string[] = await page.locator(selector).evaluate(
        (el: HTMLSelectElement) => Array.from(el.options).map((o) => o.text)
      );
      const matched = allOptions.find(
        (o) => o === raw || o.toLowerCase() === raw.toLowerCase()
      );
      if (!matched) {
        throw new Error(
          `Select "${selector}": no option matching "${raw}". Valid options: ${allOptions.join(", ")}`
        );
      }
      await page.selectOption(selector, { label: matched }, { timeout: 5000 });
    },
    verify: async (page) => {
      const raw = getValue()!;
      const selectedText: string = await page.locator(selector).evaluate(
        (el: HTMLSelectElement) => el.options[el.selectedIndex]?.text ?? ""
      );
      // Accept if selected text matches case-insensitively.
      if (selectedText.toLowerCase() !== raw.toLowerCase()) {
        throw new Error(`Select "${selector}": expected "${raw}" but got "${selectedText}"`);
      }
    },
  };
}
