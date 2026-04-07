import "dotenv-defaults/config";
import { main, DEFAULT_INPUT } from "../main";

// Pass DEFAULT_INPUT explicitly so all three sections run in the dev demo.
// Calling main() with no args would only default Section 1 fields and skip 2 & 3.
main(DEFAULT_INPUT, { keepOpen: true })
  .catch((err: Error) => {
    console.error(`[run] Workflow failed: ${err.message}`);
    process.exit(1);
  });

