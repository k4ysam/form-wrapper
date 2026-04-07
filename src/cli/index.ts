import "dotenv-defaults/config";
import { Command } from "commander";
import * as path from "path";
import { crawlForm } from "../discover/crawler";
import { buildWorkflowConfig } from "../discover/schema-builder";
import { writeWorkflowYaml } from "../discover/yaml-writer";
import { createServer } from "../api/server";
import { runLoginFlow } from "../auth/login";

const program = new Command();

program
  .name("form-api")
  .description("Form-Based API Wrapper Generator")
  .version("0.1.0");

program
  .command("discover")
  .description("Discover form fields from a URL and generate a workflow YAML")
  .requiredOption("--url <url>", "URL of the form to discover")
  .option("--out <path>", "Output path for the workflow YAML", "workflows/workflow.yaml")
  .option("--headed", "Run browser in headed mode", false)
  .option("--overwrite", "Overwrite existing workflow file", false)
  .option("--merge", "Merge new fields into existing workflow file", false)
  .action(async (opts: { url: string; out: string; headed: boolean; overwrite: boolean; merge: boolean }) => {
    const crawled = await crawlForm(opts.url, { headed: opts.headed });

    // Derive workflow name from output path filename (without extension)
    const name = path.basename(opts.out, path.extname(opts.out));
    const config = buildWorkflowConfig(crawled, name);

    await writeWorkflowYaml(config, opts.out, {
      overwrite: opts.overwrite,
      merge: opts.merge,
    });

    console.log(`Wrote ${opts.out} (${crawled.fields.length} fields, discovered: ${config.discovered})`);
  });

program
  .command("serve")
  .description("Start the form-api HTTP server")
  .option("--port <n>", "Port to listen on", "3000")
  .option("--workflows <dir>", "Directory containing workflow YAML files", "./workflows")
  .action((opts: { port: string; workflows: string }) => {
    process.env.PORT = opts.port;
    createServer(opts.workflows);
  });

program
  .command("login")
  .description("Authenticate to a workflow target site and save session cookies")
  .requiredOption("--workflow <name>", "Name of the workflow to authenticate for")
  .action(async (opts: { workflow: string }) => {
    await runLoginFlow(opts.workflow);
  });

program.parse(process.argv);
