import "dotenv-defaults/config";
import { main } from "../main";
import { WorkflowInput } from "../workflow";

//CLI trigger for variable injection
// Parses key=value pairs from command-line args and merges them over DEFAULT_INPUT.
// Usage:
//   npm run trigger                                    # run with all defaults
//   npm run trigger -- firstName=Samuel lastName=Kalt   # override any WorkflowInput field
//   npm run trigger -- firstName=Samuel medicalId=99999
const overrides: Partial<WorkflowInput> = {}; // parse the command-line args

for (const arg of process.argv.slice(2)) { // loop through the command-line args
  const eqIdx = arg.indexOf("="); // find the index of the equals sign
  if (eqIdx === -1) {
    console.warn(`[trigger] Ignoring malformed arg (expected key=value): "${arg}"`);
    continue;
  }
  const key = arg.slice(0, eqIdx); // get the key
  const value = arg.slice(eqIdx + 1); // get the value
  (overrides as Record<string, string>)[key] = value; // add the key-value pair to the overrides
}

if (Object.keys(overrides).length > 0) { // if there are overrides
  console.log("[trigger] Overrides:", overrides); // log the overrides
} else {
  console.log("[trigger] No overrides provided - running with default SOP values.");
}

main(overrides, { keepOpen: true })
  .catch((err: Error) => {
    console.error(`[trigger] Workflow failed: ${err.message}`);
    process.exit(1);
  });
