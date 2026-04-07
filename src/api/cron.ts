import "dotenv-defaults/config";
import cron from "node-cron";
import { main } from "../main";
import { runWorkflow } from "../workflow-runner";
import { markDone, popNext, queueSummary } from "./queue";

console.log("[cron] Scheduler started — workflow will run every 5 minutes.");
console.log(`[cron] Queue status: ${JSON.stringify(queueSummary())}`);

cron.schedule("*/5 * * * *", async () => {
  const item = popNext();

  if (!item) {
    console.log(`[cron] ${new Date().toISOString()} — Queue empty, nothing to process.`);
    return;
  }

  // Dispatch workflow jobs to the new runner
  if (item.type === "workflow" && item.workflowName && item.id) {
    const { workflowName, id } = item;
    console.log(`[cron] ${new Date().toISOString()} — Processing workflow job: ${workflowName} (${id})`);

    runWorkflow(workflowName, item as Record<string, unknown>)
      .then((result) => {
        markDone(item, result.status === "failed" ? "failed" : "done", undefined, result);
        console.log(`[cron] Done: ${workflowName} (${id}) — ${result.status} in ${result.durationMs}ms`);
      })
      .catch((err: Error) => {
        markDone(item, "failed", err.message);
        console.error(`[cron] Failed: ${workflowName} (${id}) — ${err.message}`);
      });

    return;
  }

  // Legacy job — run the hardcoded orchestrator via main()
  console.log(`[cron] ${new Date().toISOString()} — Processing legacy job: ${item.firstName} ${item.lastName}`);

  main(item)
    .then((summary) => {
      markDone(item, "done");
      console.log(`[cron] Done: ${item.firstName} ${item.lastName}`);
      console.log(`[cron] Summary: ${summary}`);
    })
    .catch((err: Error) => {
      markDone(item, "failed", err.message);
      console.error(`[cron] Failed: ${item.firstName} ${item.lastName} — ${err.message}`);
    });
});
