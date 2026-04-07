import { Command } from "commander";
import { crawlForm } from "../discover/crawler";

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
    const result = await crawlForm(opts.url, { headed: opts.headed });
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command("serve")
  .description("Start the form-api HTTP server")
  .option("--port <n>", "Port to listen on", "3000")
  .option("--workflows <dir>", "Directory containing workflow YAML files", "./workflows")
  .action(() => {
    console.log("not yet implemented");
    process.exit(0);
  });

program
  .command("login")
  .description("Authenticate to a workflow target site and save session cookies")
  .requiredOption("--workflow <name>", "Name of the workflow to authenticate for")
  .action(() => {
    console.log("not yet implemented");
    process.exit(0);
  });

program.parse(process.argv);
