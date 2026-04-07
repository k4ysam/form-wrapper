import { CrawledForm, CrawledField } from "./types";
import { WorkflowConfig, WorkflowField, WorkflowSection } from "../workflow-loader/types";

function toWorkflowField(f: CrawledField): WorkflowField {
  const field: WorkflowField = {
    id: f.id,
    selector: f.selector,
    type: f.type,
    value: `{{ input.${f.id} }}`,
    required: f.required,
  };

  if (f.ariaLabel) field.aria_label = f.ariaLabel;
  if (f.options) field.options = f.options;
  if (f.unsupported) field.unsupported = true;

  return field;
}

export function buildWorkflowConfig(crawled: CrawledForm, name: string): WorkflowConfig {
  const fields = crawled.fields.filter((f) => !f.unsupported);
  const unsupported = crawled.fields.filter((f) => f.unsupported);

  // Build input.properties from all fields
  const properties: Record<string, { type: string; default?: string }> = {};
  for (const f of crawled.fields) {
    const jsonSchemaType =
      f.type === "number" ? "number" :
      f.type === "checkbox" ? "boolean" :
      "string";
    properties[f.id] = { type: jsonSchemaType };
  }

  const required = crawled.fields.filter((f) => f.required && !f.unsupported).map((f) => f.id);

  // All supported fields go in one section
  const mainSection: WorkflowSection = {
    id: "main",
    fields: [...fields, ...unsupported].map(toWorkflowField),
  };

  const submitSection: WorkflowSection = {
    id: "submit",
    type: "submit",
    selector: "[type='submit']",
    success_selector: "",
    timeout_ms: 30000,
  };

  return {
    version: "1",
    name,
    description: `Auto-discovered workflow for ${crawled.url}`,
    url: crawled.url,
    discovered: crawled.isMultiStep ? "partial" : "complete",
    input: {
      type: "object",
      required: required.length > 0 ? required : undefined,
      properties,
    },
    sections: [mainSection, submitSection],
    recovery: {
      tiers: ["name_attr", "aria_label", "llm_locate"],
      llm_budget: 4,
    },
  };
}
