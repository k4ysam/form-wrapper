import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { Page } from "playwright";

export interface Step {
  name: string;
  observe: (page: Page) => Promise<boolean>;
  act: (page: Page) => Promise<void>;
  verify: (page: Page) => Promise<void>;
}

async function captureDebugArtifacts(page: Page, stepName: string): Promise<void> {
  const debugDir = join(process.cwd(), "debug");
  await mkdir(debugDir, { recursive: true }); // recursively create directory if it does not exist
  const ts = Date.now();
  await page.screenshot({ path: join(debugDir, `${stepName}-${ts}.png`) }); // take screenshot of page and save to debug directory
  const html = await page.content();
  await writeFile(join(debugDir, `${stepName}-${ts}.html`), html, "utf-8"); // save html of page to debug directory with timestamp
  console.error(`  [debug] artifacts saved to debug/${stepName}-${ts}.*`); // log error message to console
}

// engine that runs the steps of the architecture
// All steps are attempted even if an earlier one fails, so that independent fields
// (e.g. medicalId) are not skipped just because a preceding field (e.g. dateOfBirth) failed.
// If any steps fail, a combined error is thrown after all steps have been attempted.
export async function runEngine(page: Page, steps: Step[]): Promise<void> {
  const failures: string[] = [];

  for (const step of steps) {
    const shouldRun = await step.observe(page); // check if step should run

    if (!shouldRun) {
      console.log(`[engine] SKIP  "${step.name}" (observe returned false)`); 
      continue;
    }

    console.log(`[engine] START "${step.name}"`);

    let attempt = 0;
    while (attempt < 2) {
      try {
        await step.act(page); // act on the step
        await step.verify(page); // verify the step
        console.log(`[engine] PASS  "${step.name}"`);
        break; // break out of loop if step passes
      } catch (err) { 
        attempt++;
        if (attempt < 2) {
          console.warn(`[engine] RETRY "${step.name}" — ${(err as Error).message}`);
          await page.waitForTimeout(300);
          try {
            await page.waitForLoadState("domcontentloaded", { timeout: 3000 }); // wait for domcontentloaded state
          } catch {}
        } else {
          console.error(`[engine] FAIL  "${step.name}" — ${(err as Error).message}`);
          await captureDebugArtifacts(page, step.name);
          // Collect the failure and continue to the next step instead of throwing immediately.
          // This ensures independent steps (e.g. fillMedicalId) still run even when a prior
          // step (e.g. fillDateOfBirth) fails.
          failures.push(`Step "${step.name}" failed: ${(err as Error).message}`);
        }
      }
    }
  }

  // Throw once at the end if any steps failed, so the orchestrator's catch block still fires.
  if (failures.length > 0) {
    throw new Error(failures.join(" | "));
  }
}
