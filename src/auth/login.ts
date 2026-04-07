import * as path from "path";
import * as readline from "readline";
import { chromium } from "playwright";
import { loadWorkflow } from "../workflow-loader/loader";
import { saveCookies } from "./cookie-store";

const WORKFLOWS_DIR = process.env.WORKFLOWS_DIR ?? "./workflows";

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}

export async function runLoginFlow(workflowName: string): Promise<void> {
  const filePath = path.join(WORKFLOWS_DIR, `${workflowName}.yaml`);
  const config = await loadWorkflow(filePath);

  console.log(`[login] Opening browser for: ${config.url}`);

  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1366,768"],
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(config.url);

  await waitForEnter("\n[login] Log in manually, then press Enter to save your session...");

  const cookies = await context.cookies();
  await saveCookies(workflowName, cookies);
  await browser.close();

  console.log(`[login] Saved ${cookies.length} cookie(s) to .cookies/${workflowName}.json`);
}
