import "dotenv-defaults/config";
import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false, args: ["--window-size=1366,768"] });
  const page = await browser.newPage();
  const formUrl = process.env.FORM_URL;
  if (!formUrl) throw new Error("FORM_URL is not set");
  await page.goto(formUrl);
  await page.waitForLoadState("networkidle");

  console.log("\n========== PAGE TITLE ==========");
  console.log(await page.title());

  // Helper: dump all inputs/selects/textareas/buttons visible
  const dumpFields = async (label: string) => {
    console.log(`\n========== ${label} ==========`);
    const fields = await page.evaluate(() => {
      const results: any[] = [];
      document.querySelectorAll("input, select, textarea, button").forEach((el: any) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return; // skip hidden
        const labelEl =
          (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
          el.closest("label") ||
          el.previousElementSibling;
        results.push({
          tag: el.tagName,
          type: el.type || null,
          id: el.id || null,
          name: el.name || null,
          placeholder: el.placeholder || null,
          value: el.value || null,
          labelText: labelEl?.textContent?.trim() || null,
          options: el.tagName === "SELECT"
            ? Array.from(el.options).map((o: any) => ({ value: o.value, text: o.text }))
            : null,
        });
      });
      return results;
    });
    fields.forEach(f => console.log(JSON.stringify(f)));
  };

  // Dump section headings
  const dumpHeadings = async () => {
    console.log("\n========== HEADINGS / SECTION TITLES ==========");
    const headings = await page.evaluate(() => {
      const results: any[] = [];
      document.querySelectorAll("h1,h2,h3,h4,h5,h6,legend,[role='button'],[data-accordion],[aria-expanded]").forEach((el: any) => {
        results.push({
          tag: el.tagName,
          text: el.textContent?.trim(),
          ariaExpanded: el.getAttribute("aria-expanded"),
          role: el.getAttribute("role"),
          class: el.className,
        });
      });
      return results;
    });
    headings.forEach(h => console.log(JSON.stringify(h)));
  };

  await dumpFields("SECTION 1 - INITIAL FIELDS");
  await dumpHeadings();

  // Scroll down to reveal more content
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);

  await dumpFields("AFTER SCROLL - ALL VISIBLE FIELDS");
  await dumpHeadings();

  // Expand Section 2: Medical Information
  console.log("\n========== EXPANDING: Medical Information ==========");
  await page.getByRole("button", { name: "Medical Information" }).click();
  await page.waitForTimeout(800);
  await dumpFields("SECTION 2 - MEDICAL INFORMATION FIELDS");

  // Expand Section 3: Emergency Contact
  console.log("\n========== EXPANDING: Emergency Contact ==========");
  await page.getByRole("button", { name: "Emergency Contact" }).click();
  await page.waitForTimeout(800);
  await dumpFields("SECTION 3 - EMERGENCY CONTACT FIELDS");

  // Try submitting to see success state
  console.log("\n========== CHECKING SUBMIT BUTTON ==========");
  const submitBtn = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button[type='submit'], input[type='submit'], button"));
    return btns.map((b: any) => ({ tag: b.tagName, type: b.type, text: b.textContent?.trim(), id: b.id, class: b.className }));
  });
  submitBtn.forEach(b => console.log(JSON.stringify(b)));

  await page.waitForTimeout(3000);
  await browser.close();
})();
