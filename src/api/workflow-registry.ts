import * as fs from "fs";
import * as path from "path";
import { Express, Request, Response } from "express";
import { loadWorkflow } from "../workflow-loader/loader";
import { validateRequestBody } from "../workflow-loader/validator";
import { adaptToWorkflowInput } from "../workflow-loader/adapter";
import { WorkflowConfig } from "../workflow-loader/types";
import { enqueueWorkflow } from "./queue";
import { getRunStatus, listRuns } from "./runs";

export class WorkflowRegistry {
  private workflows = new Map<string, WorkflowConfig>();
  private app: Express;
  private workflowsDir: string;

  constructor(workflowsDir: string, app: Express) {
    this.workflowsDir = path.resolve(workflowsDir);
    this.app = app;
  }

  async load(): Promise<void> {
    if (!fs.existsSync(this.workflowsDir)) {
      console.log(`[registry] Workflows directory not found: ${this.workflowsDir}`);
      return;
    }

    const files = fs.readdirSync(this.workflowsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

    for (const file of files) {
      const filePath = path.join(this.workflowsDir, file);
      try {
        const config = await loadWorkflow(filePath);
        this.workflows.set(config.name, config);
        this.registerRoute(config);
        console.log(`[registry] Loaded workflow: ${config.name} (${config.input.properties ? Object.keys(config.input.properties).length : 0} fields)`);
      } catch (err) {
        console.error(`[registry] Failed to load ${file}: ${(err as Error).message}`);
      }
    }

    this.registerListRoutes();
    console.log(`[registry] ${this.workflows.size} workflow(s) registered.`);
  }

  registerRoute(config: WorkflowConfig): void {
    const { name } = config;
    this.app.post(`/api/${name}`, (req: Request, res: Response) => {
      // Look up config at request time so registerDynamic updates take effect immediately
      const current = this.workflows.get(name);
      if (!current) {
        res.status(404).json({ error: `Workflow '${name}' not found` });
        return;
      }

      const validation = validateRequestBody(current, req.body);
      if (!validation.valid) {
        res.status(400).json({ error: "Invalid request body", fields: validation.errors });
        return;
      }

      const adaptedInput = adaptToWorkflowInput(current, req.body as Record<string, unknown>);
      const runId = enqueueWorkflow(current.name, adaptedInput);

      res.status(202).json({
        runId,
        status: "queued",
        pollUrl: `/api/${current.name}/runs/${runId}`,
      });
    });
  }

  registerDynamic(config: WorkflowConfig): void {
    const isNew = !this.workflows.has(config.name);
    this.workflows.set(config.name, config);
    if (isNew) {
      // Route only registered once — handler reads from map at request time
      this.registerRoute(config);
    }
  }

  private registerListRoutes(): void {
    this.app.get("/api", (_req: Request, res: Response) => {
      const list = Array.from(this.workflows.values()).map((c) => ({
        name: c.name,
        description: c.description,
        inputSchema: c.input,
      }));
      res.json(list);
    });

    this.app.get("/api/:name/schema", (req: Request, res: Response) => {
      const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      const config = this.workflows.get(name);
      if (!config) {
        res.status(404).json({ error: `Workflow '${name}' not found` });
        return;
      }
      res.json(config.input);
    });

    this.app.get("/api/:name/runs", (req: Request, res: Response) => {
      const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      if (!this.workflows.has(name)) {
        res.status(404).json({ error: `Workflow '${name}' not found` });
        return;
      }
      res.json(listRuns(name));
    });

    this.app.get("/api/:name/runs/:runId", (req: Request, res: Response) => {
      const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
      const runId = Array.isArray(req.params.runId) ? req.params.runId[0] : req.params.runId;
      const status = getRunStatus(name, runId);
      if (!status) {
        res.status(404).json({ error: `Run '${runId}' not found for workflow '${name}'` });
        return;
      }
      res.json(status);
    });
  }

  getWorkflow(name: string): WorkflowConfig | undefined {
    return this.workflows.get(name);
  }
}
