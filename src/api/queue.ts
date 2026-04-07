import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { WorkflowInput } from "../workflow";

export type QueueStatus = "pending" | "processing" | "done" | "failed";

export type QueueItem = Partial<WorkflowInput> & {
  status: QueueStatus;
  error?: string;
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
 * Updates the matching item (by identity) to the given status.
 * Called after the workflow run completes or fails.
 */
export function markDone(item: QueueItem, status: "done" | "failed", error?: string): void {
  const items = readQueue();
  const idx = items.findIndex(
    (i) => i.firstName === item.firstName && i.lastName === item.lastName && i.medicalId === item.medicalId
  );
  if (idx === -1) return;
  items[idx] = { ...items[idx], status, ...(error ? { error } : {}) };
  writeQueue(items);
}

/**
 * Adds a new item to the end of the queue with status "pending".
 */
export function enqueue(input: Partial<WorkflowInput>): QueueItem {
  const items = readQueue();
  const newItem: QueueItem = { ...input, status: "pending" };
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
