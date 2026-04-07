import express, { Request, Response } from "express";
import { DEFAULT_INPUT, main } from "../main";
import { WorkflowInput } from "../workflow";
import { enqueue, queueSummary } from "./queue";

const PORT = Number(process.env.PORT ?? 3000);

export const app = express();
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/queue", (_req: Request, res: Response) => {
  res.json(queueSummary());
});

app.post("/enqueue", (req: Request, res: Response) => {
  const input: Partial<WorkflowInput> = req.body ?? {};
  const item = enqueue(input);
  res.status(201).json({ status: "queued", item, queue: queueSummary() });
});

app.post("/run", (req: Request, res: Response) => {
  const overrides: Partial<WorkflowInput> = req.body ?? {};
  const effectiveInput: WorkflowInput = { ...DEFAULT_INPUT, ...overrides };

  res.status(202).json({
    status: "accepted",
    message: "Workflow started. Check console output for progress.",
    effectiveInput,
  });

  main(overrides).catch((err: Error) => {
    console.error(`[server] Workflow run failed: ${err.message}`);
  });
});

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found. Available routes: POST /run, POST /enqueue, GET /queue, GET /health" });
});

export function createServer() {
  return app.listen(PORT, () => {
    console.log(`[server] HTTP API listening on http://localhost:${PORT}`);
    console.log(`[server] POST /run      — trigger workflow immediately`);
    console.log(`[server] POST /enqueue  — add a patient to the cron queue`);
    console.log(`[server] GET  /queue    — view queue status`);
    console.log(`[server] GET  /health   — health check`);
  });
}
