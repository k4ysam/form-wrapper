/**
 * Test runner for the medical form workflow.
 *
 * Usage:
 *   npm run test:scenarios
 *
 * What it does:
 *   1. Runs TC-01 through TC-05 (happy-path, 0 LLM calls) sequentially.
 *      Each scenario opens a fresh browser, fills the form, and reports PASS or FAIL.
 *   2. Enqueues TC-06 through TC-08 (AI-recovery / edge-case scenarios) into
 *      queue.json as "pending" — ready to be processed by `npm run cron`.
 *
 *   Each run launches a full Playwright browser. Running concurrently opens
 *   multiple browsers simultaneously which could exhaust memory and also hit rate limits.
 */

import "dotenv-defaults/config";
import { enqueue } from "../api/queue";
import { main } from "../main";
import { aiRecoveryScenarios, happyPathScenarios, Scenario } from "./scenarios";

type TestResult = {
  id: string;
  name: string;
  status: "PASS" | "FAIL";
  durationMs: number;
  error?: string;
};

async function runScenario(scenario: Scenario): Promise<TestResult> {
  const start = Date.now();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[runner] START ${scenario.id}: ${scenario.name}`);
  console.log(`[runner] Note: ${scenario.note}`);
  console.log(`${"=".repeat(60)}`);

  try {
    const summary = await main(scenario.input);
    const durationMs = Date.now() - start;
    console.log(`\n[runner] PASS  ${scenario.id} — ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`[runner] Summary: ${summary}`);
    return { id: scenario.id, name: scenario.name, status: "PASS", durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = (err as Error).message;
    console.error(`\n[runner] FAIL  ${scenario.id} — ${error}`);
    return { id: scenario.id, name: scenario.name, status: "FAIL", durationMs, error };
  }
}

function printSummary(results: TestResult[]): void {
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`\n${"─".repeat(60)}`);
  console.log(`[runner] RESULTS — ${passed} passed, ${failed} failed\n`);

  for (const r of results) {
    const icon = r.status === "PASS" ? "✓" : "✗";
    const duration = `${(r.durationMs / 1000).toFixed(1)}s`;
    const suffix = r.error ? `  ← ${r.error}` : "";
    console.log(`  ${icon}  ${r.id.padEnd(6)} ${r.name.padEnd(35)} ${duration}${suffix}`);
  }
  console.log(`${"─".repeat(60)}\n`);
}

function enqueueAiRecoveryScenarios(): void {
  console.log(`[runner] Enqueuing AI-recovery scenarios into queue.json...`);
  for (const scenario of aiRecoveryScenarios) {
    const item = enqueue(scenario.input);
    console.log(`[runner]   queued ${scenario.id}: ${scenario.name} (medicalId: ${item.medicalId ?? "n/a"})`);
  }
  console.log(`[runner] Done. Run \`npm run cron\` to process them.`);
}

async function main_runner(): Promise<void> {
  console.log(`\n[runner] ============================================`);
  console.log(`[runner] Test Scenario Runner`);
  console.log(`[runner] Happy-path scenarios: ${happyPathScenarios.length}`);
  console.log(`[runner] AI-recovery scenarios: ${aiRecoveryScenarios.length} (will be queued)`);
  console.log(`[runner] ============================================\n`);

  const results: TestResult[] = [];

  for (const scenario of happyPathScenarios) {
    const result = await runScenario(scenario);
    results.push(result);
  }

  printSummary(results);
  enqueueAiRecoveryScenarios();

  const anyFailed = results.some((r) => r.status === "FAIL");
  process.exit(anyFailed ? 1 : 0);
}

main_runner().catch((err: Error) => {
  console.error(`[runner] Fatal error: ${err.message}`);
  process.exit(1);
});
