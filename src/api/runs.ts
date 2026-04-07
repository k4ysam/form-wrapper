import { readQueue, WorkflowRunResult } from "./queue";

export interface RunStatus {
  runId: string;
  workflowName: string;
  queueStatus: "pending" | "processing" | "done" | "failed";
  result?: WorkflowRunResult;
  error?: string;
}

/**
 * Returns the status of a single run by workflowName + runId.
 * Reads directly from queue.json — no JSONL parsing needed for status.
 */
export function getRunStatus(workflowName: string, runId: string): RunStatus | null {
  const items = readQueue();
  const item = items.find((i) => i.id === runId && i.workflowName === workflowName);
  if (!item) return null;

  return {
    runId,
    workflowName,
    queueStatus: item.status,
    result: item.result,
    error: item.error,
  };
}

/**
 * Lists all runs for a given workflow, newest first.
 */
export function listRuns(workflowName: string): RunStatus[] {
  const items = readQueue();
  return items
    .filter((i) => i.workflowName === workflowName && i.id !== undefined)
    .map((i) => ({
      runId: i.id as string,
      workflowName,
      queueStatus: i.status,
      result: i.result,
      error: i.error,
    }))
    .reverse();
}
