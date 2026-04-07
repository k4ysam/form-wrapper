import { WorkflowConfig } from "./types";
import { WorkflowInput } from "../workflow/types";

/**
 * Resolves {{ input.X }} template expressions against requestBody.
 * Falls back to default value from config.input.properties if the key is absent.
 */
function resolveTemplate(
  template: string,
  requestBody: Record<string, unknown>,
  properties: WorkflowConfig["input"]["properties"]
): string {
  return template.replace(/\{\{\s*input\.(\w+)\s*\}\}/g, (_match, key: string) => {
    if (key in requestBody && requestBody[key] !== undefined) {
      return String(requestBody[key]);
    }
    const defaultVal = properties[key]?.default;
    if (defaultVal !== undefined) return defaultVal;
    return "";
  });
}

/**
 * Converts a WorkflowConfig + JSON request body into a WorkflowInput
 * suitable for the existing execution engine.
 *
 * Template expressions ({{ input.X }}) in field values are resolved against
 * requestBody, with fallback to config.input.properties[X].default.
 */
export function adaptToWorkflowInput(
  config: WorkflowConfig,
  requestBody: Record<string, unknown>
): WorkflowInput {
  const props = config.input.properties;

  // Build a flat key→value map by resolving all templates
  const resolved: Record<string, string> = {};
  for (const section of config.sections) {
    if (!section.fields) continue;
    for (const field of section.fields) {
      if (field.value) {
        resolved[field.id] = resolveTemplate(field.value, requestBody, props);
      }
    }
  }

  // Map resolved values onto the WorkflowInput shape.
  // We do a best-effort key match — unknown keys are silently ignored.
  return {
    firstName:        resolved["firstName"]        ?? (requestBody["firstName"]        as string | undefined) ?? "",
    lastName:         resolved["lastName"]         ?? (requestBody["lastName"]         as string | undefined) ?? "",
    dateOfBirth:      resolved["dateOfBirth"]      ?? (requestBody["dateOfBirth"]      as string | undefined) ?? "",
    medicalId:        resolved["medicalId"]        ?? (requestBody["medicalId"]        as string | undefined) ?? "",
    gender:           resolved["gender"]           ?? (requestBody["gender"]           as string | undefined),
    bloodType:        resolved["bloodType"]        ?? (requestBody["bloodType"]        as string | undefined),
    allergies:        resolved["allergies"]        ?? (requestBody["allergies"]        as string | undefined),
    medications:      resolved["medications"]      ?? (requestBody["medications"]      as string | undefined),
    emergencyContact: resolved["emergencyContact"] ?? (requestBody["emergencyContact"] as string | undefined),
    emergencyPhone:   resolved["emergencyPhone"]   ?? (requestBody["emergencyPhone"]   as string | undefined),
  };
}
