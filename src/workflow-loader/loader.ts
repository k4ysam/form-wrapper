import * as fs from "fs";
import { parse } from "yaml";
import { ZodError } from "zod";
import { WorkflowConfig, WorkflowConfigSchema } from "./types";

export async function loadWorkflow(filePath: string): Promise<WorkflowConfig> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed: unknown = parse(raw);

  try {
    return WorkflowConfigSchema.parse(parsed);
  } catch (err) {
    if (err instanceof ZodError) {
      const lines = err.issues.map((issue) => {
        const fieldPath = issue.path.join(".") || "(root)";
        return `  ${fieldPath}: ${issue.message}`;
      });
      throw new Error(`Invalid workflow config:\n${lines.join("\n")}`);
    }
    throw err;
  }
}
