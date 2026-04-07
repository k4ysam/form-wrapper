import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { WorkflowInput } from "../workflow";

export type QueueStatus = "pending" | "processing" | "done" | "failed";

export interface WorkflowRunResult {
  runId: string;
  status: "success" | "failed" | "ambiguous";
  message: string;
  tiersUsed: string[];
  durationMs: number;
  staleFields?: Array<{ fieldId: string; selector: string; reason: string }>;
}

export type QueueItem = Partial<WorkflowInput> & {
  status: QueueStatus;
  error?: string;
  // Extended fields for workflow jobs (optional — legacy items omit these)
  id?: string;
  type?: "legacy" | "workflow";
  workflowName?: string;
  result?: WorkflowRunResult;
};

const QUEUE_PATH = join(process.cwd(), "queue.json");

export function readQueue(): QueueItem[] {
  try {
    return JSON.parse(readFileSync(QUEUE_PATH, "utf-8")) as QueueItem[];
  } catch {
    return [];
  }
}

export function writeQueue(items: QueueItem[]): void {
  writeFileSync(QUEUE_PATH, JSON.stringify(items, null, 2), "utf-8");
}

/**
 * Finds the first "pending" item, atomically marks it "processing",
 * writes the queue, then returns it. Returns null if queue is empty.
 */
export function popNext(): QueueItem | null {
  const items = readQueue();
  const idx = items.findIndex((i) => i.status === "pending");
  if (idx === -1) return null;

  items[idx] = { ...items[idx], status: "processing" };
  writeQueue(items);
  return items[idx];
}

/**
 * Updates the matching item to done/failed.
 * Legacy items matched by firstName+lastName+medicalId.
 * Workflow items matched by id.
 * Accepts an optional WorkflowRunResult stored on the item.
 */
export function markDone(
  item: QueueItem,
  status: "done" | "failed",
  error?: string,
  result?: WorkflowRunResult
): void {
  const items = readQueue();
  const idx = item.id
    ? items.findIndex((i) => i.id === item.id)
    : items.findIndex(
        (i) => i.firstName === item.firstName && i.lastName === item.lastName && i.medicalId === item.medicalId
      );
  if (idx === -1) return;
  items[idx] = {
    ...items[idx],
    status,
    ...(error ? { error } : {}),
    ...(result ? { result } : {}),
  };
  writeQueue(items);
}

/**
 * Enqueues a workflow job. Returns the generated runId.
 */
export function enqueueWorkflow(workflowName: string, input: WorkflowInput): string {
  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const items = readQueue();
  const newItem: QueueItem = {
    id: runId,
    type: "workflow",
    workflowName,
    status: "pending",
    ...input,
  };
  items.push(newItem);
  writeQueue(items);
  return runId;
}

/**
 * Finds a queue item by its id field. Returns null if not found.
 */
export function findById(id: string): QueueItem | null {
  const items = readQueue();
  return items.find((i) => i.id === id) ?? null;
}

/**
 * Adds a new legacy item to the end of the queue with status "pending".
 */
export function enqueue(input: Partial<WorkflowInput>): QueueItem {
  const items = readQueue();
  const newItem: QueueItem = { ...input, type: "legacy", status: "pending" };
  items.push(newItem);
  writeQueue(items);
  return newItem;
}

/**
 * Returns a summary of queue item counts by status.
 */
export function queueSummary(): Record<QueueStatus, number> & { total: number } {
  const items = readQueue();
  const counts = { pending: 0, processing: 0, done: 0, failed: 0, total: items.length };
  for (const item of items) counts[item.status]++;
  return counts;
}
