import * as path from "path";
import { Request, Response } from "express";
import { z } from "zod";
import { buildWorkflowConfig } from "../discover/schema-builder";
import { writeWorkflowYaml } from "../discover/yaml-writer";
import { WorkflowRegistry } from "./workflow-registry";
import { CrawledField, CrawledForm, FieldType } from "../discover/types";

const VALID_FIELD_TYPES: readonly FieldType[] = [
  "text", "email", "tel", "date", "number", "password",
  "textarea", "select", "checkbox", "radio", "file",
];

const IngestFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string(),
  label: z.string().nullable().optional(),
  ariaLabel: z.string().nullable().optional(),
  required: z.boolean().default(false),
  disabled: z.boolean().default(false),
  options: z.array(z.string()).nullable().optional(),
});

const IngestBodySchema = z.object({
  name: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Workflow name must be lowercase alphanumeric with hyphens"),
  url: z.string().url(),
  fields: z.array(IngestFieldSchema).min(1),
});

export function createIngestHandler(registry: WorkflowRegistry, workflowsDir: string) {
  return async (req: Request, res: Response): Promise<void> => {
    const parsed = IngestBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { name, url, fields } = parsed.data;

    const crawledFields: CrawledField[] = fields.map((f, i) => {
      const rawType = f.type as string;
      const type: FieldType = (VALID_FIELD_TYPES as readonly string[]).includes(rawType)
        ? (rawType as FieldType)
        : "text";

      const selector = f.name
        ? `[name='${f.name}']`
        : f.ariaLabel
        ? `[aria-label='${f.ariaLabel}']`
        : `input:nth-of-type(${i + 1})`;

      const field: CrawledField = {
        id: f.name,
        type,
        label: f.label ?? f.ariaLabel ?? f.name,
        selector,
        required: f.required,
        nameAttr: f.name,
      };

      if (f.ariaLabel) field.ariaLabel = f.ariaLabel;
      if (f.options?.length) field.options = f.options;
      if (f.disabled) field.unsupported = true;

      return field;
    });

    const crawledForm: CrawledForm = { url, fields: crawledFields, isMultiStep: false };
    const config = buildWorkflowConfig(crawledForm, name);

    const outPath = path.join(path.resolve(workflowsDir), `${name}.yaml`);
    await writeWorkflowYaml(config, outPath, { overwrite: true });

    registry.registerDynamic(config);

    console.log(`[ingest] Registered workflow '${name}' (${fields.length} fields) from ${url}`);

    res.json({
      status: "ok",
      name,
      fieldCount: fields.length,
      endpoint: `/api/${name}`,
      schemaUrl: `/api/${name}/schema`,
    });
  };
}
