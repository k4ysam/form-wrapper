import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

export type LogEntry = {
  ts: string;
  runId: string;
  agent: string;
  event: string;
  data?: unknown;
};

/**
 * Append-only structured audit logger.
 * Each workflow run gets its own JSONL file under logs/run-<runId>.jsonl,
 * so runs can be audited and replayed.
 */
export class AuditLogger {
  private readonly runId: string;
  private readonly logPath: string;

  constructor(runId: string) {
    this.runId = runId;
    const logsDir = join(process.cwd(), "logs");
    mkdirSync(logsDir, { recursive: true });
    this.logPath = join(logsDir, `run-${runId}.jsonl`);
    this.record("orchestrator", "run:start", { runId });
  }

  record(agent: string, event: string, data?: unknown): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      runId: this.runId,
      agent,
      event,
      data,
    };
    appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
    console.log(`[audit] ${agent.padEnd(18)} | ${event}`);
  }

  recordStep(
    agent: string,
    step: {
      stepType?: string;
      text?: string;
      reasoning?: string;
      toolCalls?: Array<{ toolName: string; args: unknown }>;
      finishReason?: string;
      usage?: unknown;
    }
  ): void {
    this.record(agent, "step", {
      stepType: step.stepType,
      text: step.text?.slice(0, 200),
      reasoning: step.reasoning?.slice(0, 500),
      toolCalls: step.toolCalls?.map((tc) => ({ toolName: tc.toolName, args: tc.args })),
      finishReason: step.finishReason,
      usage: step.usage,
    });
    if (step.reasoning) {
      console.log(`[reasoning] ${agent.padEnd(18)} | ${step.reasoning.slice(0, 200)}${step.reasoning.length > 200 ? "…" : ""}`);
    }
  }

  get path(): string {
    return this.logPath;
  }

  static createRunId(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }
}
