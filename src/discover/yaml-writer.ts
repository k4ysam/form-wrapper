import * as fs from "fs";
import * as path from "path";
import { Document, parseDocument, stringify, YAMLMap, YAMLSeq } from "yaml";
import { WorkflowConfig } from "../workflow-loader/types";

export interface WriteFlags {
  overwrite?: boolean;
  merge?: boolean;
}

function attachFieldComments(doc: Document): void {
  const sections = doc.getIn(["sections"]) as YAMLSeq | null;
  if (!sections) return;

  for (const section of sections.items) {
    const sectionMap = section as YAMLMap;
    const fields = sectionMap.getIn(["fields"]) as YAMLSeq | null;
    if (!fields) continue;

    for (const fieldNode of fields.items) {
      const fieldMap = fieldNode as YAMLMap;
      const type = fieldMap.get("type") as string | undefined;
      const unsupported = fieldMap.get("unsupported") as boolean | undefined;

      if (unsupported) {
        fieldMap.commentBefore = " UNSUPPORTED: file upload not supported in V1";
      } else {
        fieldMap.commentBefore = ` selector priority: name attr > aria-label > data-testid > id > CSS\n # type: ${type ?? "text"}`;
      }
    }
  }
}

export async function writeWorkflowYaml(
  config: WorkflowConfig,
  outPath: string,
  flags: WriteFlags = {}
): Promise<void> {
  const resolved = path.resolve(outPath);
  const exists = fs.existsSync(resolved);

  if (exists && !flags.overwrite && !flags.merge) {
    throw new Error(`File exists. Use --overwrite to replace or --merge to update.`);
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  if (flags.merge && exists) {
    await mergeYaml(config, resolved);
    return;
  }

  // Fresh write (new file or --overwrite)
  const doc = new Document(config as unknown as Record<string, unknown>);
  attachFieldComments(doc);
  fs.writeFileSync(resolved, doc.toString(), "utf8");
}

async function mergeYaml(incoming: WorkflowConfig, filePath: string): Promise<void> {
  const existing = parseDocument(fs.readFileSync(filePath, "utf8"));

  for (const incomingSection of incoming.sections) {
    if (!incomingSection.fields) continue;

    // Find matching section in existing doc by id
    const sections = existing.getIn(["sections"]) as YAMLSeq | null;
    if (!sections) continue;

    let existingSection: YAMLMap | null = null;
    for (const s of sections.items) {
      const sMap = s as YAMLMap;
      if (sMap.get("id") === incomingSection.id) {
        existingSection = sMap;
        break;
      }
    }
    if (!existingSection) continue;

    const existingFields = existingSection.getIn(["fields"]) as YAMLSeq | null;
    if (!existingFields) continue;

    // Collect existing field ids
    const existingIds = new Set<string>();
    for (const f of existingFields.items) {
      const fMap = f as YAMLMap;
      const id = fMap.get("id") as string | undefined;
      if (id) existingIds.add(id);
    }

    // Append new fields not already present
    for (const newField of incomingSection.fields) {
      if (!existingIds.has(newField.id)) {
        const newDoc = new Document(newField as unknown as Record<string, unknown>);
        const newNode = newDoc.contents as YAMLMap;
        const unsupported = newField.unsupported;
        newNode.commentBefore = unsupported
          ? " UNSUPPORTED: file upload not supported in V1"
          : ` selector priority: name attr > aria-label > data-testid > id > CSS\n # type: ${newField.type}`;
        existingFields.items.push(newNode);
      }
    }
  }

  fs.writeFileSync(filePath, existing.toString(), "utf8");
}
