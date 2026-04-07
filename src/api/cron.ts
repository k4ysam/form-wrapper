import "dotenv-defaults/config";
import cron from "node-cron";
import { main } from "../main";
import { markDone, popNext, queueSummary } from "./queue";

console.log("[cron] Scheduler started — workflow will run every 5 minutes.");
console.log(`[cron] Queue status: ${JSON.stringify(queueSummary())}`);

cron.schedule("*/5 * * * *", async () => {
  const item = popNext();

  if (!item) {
    console.log(`[cron] ${new Date().toISOString()} — Queue empty, nothing to process.`);
    return;
  }

  console.log(`[cron] ${new Date().toISOString()} — Processing: ${item.firstName} ${item.lastName}`);

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
