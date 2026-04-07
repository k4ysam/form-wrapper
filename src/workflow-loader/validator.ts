import { z, ZodTypeAny } from "zod";
import { WorkflowConfig } from "./types";

/**
 * Dynamically builds a Zod schema from config.input and validates the request body.
 * Required fields are enforced; optional fields are allowed to be absent.
 */
export function validateRequestBody(
  config: WorkflowConfig,
  body: unknown
): { valid: boolean; errors?: string[] } {
  const { properties, required = [] } = config.input;
  const requiredSet = new Set(required);

  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let fieldSchema: ZodTypeAny;

    switch (prop.type) {
      case "number":
        fieldSchema = z.coerce.number();
        break;
      case "boolean":
        fieldSchema = z.coerce.boolean();
        break;
      default:
        fieldSchema = z.string().min(1, `${key} must not be empty`);
    }

    if (!requiredSet.has(key)) {
      fieldSchema = fieldSchema.optional();
    }

    shape[key] = fieldSchema;
  }

  const schema = z.object(shape);
  const result = schema.safeParse(body);

  if (result.success) {
    return { valid: true };
  }

  const errors = result.error.issues.map((issue) => {
    const field = issue.path.join(".") || "(root)";
    return `${field}: ${issue.message}`;
  });

  return { valid: false, errors };
}
