import { z } from "zod";

// ── Field-level schema ────────────────────────────────────────────────────────

export const WorkflowFieldSchema = z.object({
  id: z.string(),
  selector: z.string(),
  aria_label: z.string().optional(),
  type: z.string(),
  value: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  dispatch_events: z.array(z.string()).optional(),
  unsupported: z.boolean().optional(),
});

export type WorkflowField = z.infer<typeof WorkflowFieldSchema>;

// ── Section-level schema ──────────────────────────────────────────────────────

export const WorkflowSectionSchema = z.object({
  id: z.string(),
  type: z.enum(["submit"]).optional(),
  fields: z.array(WorkflowFieldSchema).optional(),
  selector: z.string().optional(),
  success_selector: z.string().optional(),
  timeout_ms: z.number().optional(),
});

export type WorkflowSection = z.infer<typeof WorkflowSectionSchema>;

// ── Input schema (JSON-Schema-like) ──────────────────────────────────────────

export const InputPropertySchema = z.object({
  type: z.string(),
  default: z.string().optional(),
});

export const WorkflowInputSchema = z.object({
  type: z.literal("object"),
  required: z.array(z.string()).optional(),
  properties: z.record(InputPropertySchema),
});

export type WorkflowInputSpec = z.infer<typeof WorkflowInputSchema>;

// ── Auth schema ───────────────────────────────────────────────────────────────

export const WorkflowAuthSchema = z.object({
  strategy: z.enum(["cookie_jar"]),
  cookie_file: z.string().optional(),
  csrf_selector: z.string().optional(),
});

export type WorkflowAuth = z.infer<typeof WorkflowAuthSchema>;

// ── Recovery schema ───────────────────────────────────────────────────────────

export const RecoverySchema = z.object({
  tiers: z.array(z.string()),
  llm_budget: z.number().int().min(0),
});

// ── Root WorkflowConfig schema ────────────────────────────────────────────────

export const WorkflowConfigSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string().optional(),
  url: z.string().url(),
  discovered: z.enum(["complete", "partial"]).optional(),
  auth: WorkflowAuthSchema.optional(),
  input: WorkflowInputSchema,
  sections: z.array(WorkflowSectionSchema),
  recovery: RecoverySchema,
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
