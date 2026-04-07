import express, { Request, Response } from "express";
import { DEFAULT_INPUT, main } from "../main";
import { WorkflowInput } from "../workflow";
import { enqueue, queueSummary } from "./queue";
import { WorkflowRegistry } from "./workflow-registry";

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

// 404 fallback — registered last so workflow routes from registry take priority
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found. Available routes: POST /run, POST /enqueue, GET /queue, GET /health, GET /api, POST /api/:name" });
});

export function createServer(workflowsDir = "./workflows") {
  const registry = new WorkflowRegistry(workflowsDir, app);

  registry.load().then(() => {
    app.listen(PORT, () => {
      console.log(`[server] HTTP API listening on http://localhost:${PORT}`);
      console.log(`[server] POST /run           — trigger legacy workflow immediately`);
      console.log(`[server] POST /enqueue       — add to legacy cron queue`);
      console.log(`[server] GET  /queue         — view queue status`);
      console.log(`[server] GET  /health        — health check`);
      console.log(`[server] GET  /api           — list registered form-api workflows`);
      console.log(`[server] POST /api/:name     — submit a form-api workflow`);
    });
  }).catch((err: Error) => {
    console.error(`[server] Registry failed to load: ${err.message}`);
    process.exit(1);
  });
}
