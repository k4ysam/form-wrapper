# Blueprint: Form-Based API Wrapper Generator
**Generated:** 2026-04-06
**Source PRD:** `docs/PRD-form-api-wrapper.md`
**Repo:** `git@github.com:k4ysam/form-wrapper.git`
**Base branch:** `main`
**Mode:** Branch/PR workflow (git + GitHub CLI available)

---

## Overview

Turn the existing TypeScript/Playwright agentic automation framework into a general-purpose
form-to-API tool. A CLI discovers any web form's field schema and saves `workflow.yaml`;
an HTTP server reads those configs and registers typed async REST endpoints.

**9 steps across 3 phases. Steps 8+9 parallel. All other steps sequential.**
*(Steps 4+5 originally planned as parallel — changed to sequential after adversarial review; see Amendments.)*

---

## Dependency Graph

```
Step 1 (scaffold + Express + session.ts refactor)
  └── Step 2 (DOM crawler)
        └── Step 3 (schema builder + YAML writer [yaml pkg])
              └── Step 4 (Zod loader + WorkflowInput adapter)
                    └── Step 5 (workflow registry + dynamic routes)
                          └── Step 6 (async execution + queue.ts id/runId extension)
                                └── Step 7 (status polling + result extraction)
                                      ├── Step 8 (login + cookie persistence)  ┐ parallel
                                      └── Step 9 (event dispatch + stale)      ┘
```

---

## Step 1 — Project Scaffold + CLI Skeleton

**Branch:** `feat/form-api-scaffold`
**PR title:** `feat: project scaffold and CLI skeleton`
**Model tier:** default
**Depends on:** nothing
**Parallel with:** nothing

### Context Brief

The existing repo (`form-wrapper`) is a single-purpose Playwright automation tool.
This step restructures it as a multi-command CLI tool. **Two existing files must be
modified here** to unblock all later steps cleanly:

1. **`src/session.ts`** — currently returns a bare `Page` with `headless: false` hardcoded.
   Step 2 needs headless mode; Step 8 needs `BrowserContext` for cookie operations.
   Refactor to return `{ page, context }` and accept `{ headed?: boolean }`.
   The existing callers (`src/_internal/run.ts`, `src/api/serve.ts`, etc.) must be updated
   to destructure `{ page }` from the new return value.

2. **`src/api/server.ts`** — currently uses raw `http.createServer` with manual routing.
   Dynamic routes like `/api/:name/runs/:runId` are impractical without a router.
   Add `express` and rewrite the server using Express. Existing endpoints (`/run`,
   `/enqueue`, `/queue`, `/health`) must be preserved with identical behaviour.

Key existing files to understand but not touch (except the two above):
- `src/api/queue.ts` — file-backed queue (will be extended in Step 6)
- `src/logger.ts` — JSONL audit logger (will be extended in Step 3)

### Tasks

- [ ] Add `commander` to `package.json` dependencies
- [ ] Add `yaml` (NOT `js-yaml`) to dependencies — supports comment-preserving serialisation
- [ ] Add `express` and `@types/express` to dependencies
- [ ] Add `zod` to dependencies (if not already present)
- [ ] **Refactor `src/session.ts`:**
  - Change signature: `createSession(options?: { headed?: boolean }): Promise<{ page: Page; context: BrowserContext }>`
  - Default: `headless: true` (flip from current `false`)
  - Update all existing callers to destructure `{ page }` from return value:
    - `src/_internal/run.ts`
    - `src/api/serve.ts` (if it calls createSession directly)
    - Any other file that imports `createSession`
- [ ] **Rewrite `src/api/server.ts`** using Express:
  - All four existing endpoints preserved: `POST /run`, `POST /enqueue`, `GET /queue`, `GET /health`
  - Same request/response shapes as before
  - Export `app` (Express instance) for use by `WorkflowRegistry` in Step 5
- [ ] Create `src/cli/index.ts` — top-level commander program with three subcommands:
  - `form-api discover --url <url> [--out <path>] [--headed] [--overwrite] [--merge]`
  - `form-api serve [--port <n>] [--workflows <dir>]`
  - `form-api login --workflow <name>`
  - Each subcommand prints "not yet implemented" and exits 0 for now
- [ ] Add `package.json` script: `"form-api": "ts-node src/cli/index.ts"`
- [ ] Create `workflows/` directory with `.gitkeep`
- [ ] Add `.cookies/` to `.gitignore`
- [ ] Create `src/discover/` directory (empty, with `.gitkeep`)
- [ ] Create `src/workflow-loader/` directory (empty, with `.gitkeep`)

### Verification

```bash
npm run form-api -- discover --url https://example.com
# Expected: "not yet implemented" or similar, exit 0

npm run form-api -- serve
# Expected: "not yet implemented", exit 0

npm run form-api -- --help
# Expected: lists discover, serve, login subcommands
```

### Exit Criteria

- [ ] `npm run form-api -- --help` lists all 3 subcommands
- [ ] `npm run form-api -- discover --help` shows `--url`, `--out`, `--headed`, `--overwrite`, `--merge` flags
- [ ] `npm run form-api -- serve --help` shows `--port`, `--workflows` flags
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`)
- [ ] Existing scripts (`npm run dev`, `npm run server`) still work

---

## Step 2 — DOM Crawler

**Branch:** `feat/form-api-crawler`
**PR title:** `feat: DOM crawler for form field discovery`
**Model tier:** default
**Depends on:** Step 1
**Parallel with:** nothing

### Context Brief

The DOM crawler visits a URL in a Playwright browser, reads all form fields, and
returns structured field metadata. It does NOT write any files — that's Step 3.

Reuse `src/session.ts` for browser lifecycle. The crawler should work in both
headless (default) and headed (`--headed`) mode.

**Selector priority rule (critical):** Always prefer in this order:
1. `name` attribute → `[name='fieldName']`
2. `aria-label` attribute → `[aria-label='Label Text']`
3. `data-testid` attribute
4. `id` attribute → `#fieldId` (only if the ID does not look auto-generated, i.e., not a UUID or numeric string)
5. Scoped CSS (last resort)

**Field types to detect:** `text`, `email`, `tel`, `date`, `number`, `password`,
`textarea`, `select` (with options), `checkbox`, `radio`, `file` (flag as `unsupported: true`).

**Multi-step detection:** If the page contains a "Next" or "Continue" button after
initial field extraction, set `discovered: partial` in the returned metadata.

### Tasks

- [ ] Create `src/discover/crawler.ts`
- [ ] Export `crawlForm(url: string, options: CrawlerOptions): Promise<CrawledForm>`
  - `CrawlerOptions`: `{ headed?: boolean }`
  - `CrawledForm`: `{ url, fields: CrawledField[], isMultiStep: boolean }`
  - `CrawledField`: `{ id, type, label, selector, ariaLabel?, nameAttr?, required, options?, unsupported? }`
- [ ] Implement field extraction:
  - Query all `<input>`, `<select>`, `<textarea>` elements
  - For each: resolve label from `<label for="...">`, `aria-label`, `placeholder`
  - Apply selector priority rule
  - For `<select>`: extract all `<option>` text values
  - For `type="file"`: set `unsupported: true`
- [ ] Detect multi-step: look for buttons with text matching `/next|continue|proceed/i`
  after form fields are found
- [ ] Reuse `src/session.ts` for browser/page creation

### Verification

```bash
# Point at a simple public form for testing
npm run form-api -- discover --url https://www.w3schools.com/html/html_forms.asp
# Should print raw field metadata as JSON (temporarily log to console)
```

### Exit Criteria

- [ ] `crawlForm()` returns at least `{ fields, isMultiStep }` for a real form URL
- [ ] Field objects contain `selector`, `type`, `label`, `required`
- [ ] `<select>` fields include `options` array
- [ ] `type="file"` fields have `unsupported: true`
- [ ] Multi-step forms set `isMultiStep: true`
- [ ] TypeScript compiles without errors

---

## Step 3 — Schema Builder + YAML Writer

**Branch:** `feat/form-api-schema-builder`
**PR title:** `feat: schema builder and annotated YAML writer`
**Model tier:** default
**Depends on:** Step 2
**Parallel with:** nothing

### Context Brief

Takes `CrawledForm` output from the crawler and produces two things:
1. A typed `WorkflowConfig` object (the internal representation)
2. A `workflow.yaml` file written to disk with inline YAML comments

The YAML is the user-facing artifact. It must be human-editable. Generated comments
must explain each field's selector and how to fix it. The writer must respect
`--overwrite` and `--merge` flags (never silently overwrite).

`WorkflowConfig` is also the type that Step 4 will load and validate via Zod.
Define the Zod schema here so Step 4 can import it.

### Tasks

- [ ] Create `src/discover/schema-builder.ts`
  - Export `buildWorkflowConfig(crawled: CrawledForm, name: string): WorkflowConfig`
  - Maps `CrawledField[]` → `WorkflowSection[]` → `WorkflowConfig`
  - Infers `input.properties` from required fields (required fields → `required[]`)
  - Sets `discovered: complete` if `!isMultiStep`, else `discovered: partial`
- [ ] Create `src/workflow-loader/types.ts`
  - Define `WorkflowConfig` TypeScript type (matches the YAML schema from PRD §6)
  - Define Zod schema `WorkflowConfigSchema` — export both
  - Fields: `version`, `name`, `description`, `url`, `auth?`, `input`, `sections`, `recovery`
- [ ] Create `src/discover/yaml-writer.ts`
  - Export `writeWorkflowYaml(config: WorkflowConfig, outPath: string, flags: WriteFlags): Promise<void>`
  - `WriteFlags`: `{ overwrite?: boolean; merge?: boolean }`
  - Default (no flags): if file exists, throw with message "File exists. Use --overwrite to replace or --merge to update."
  - `--overwrite`: replace file entirely
  - `--merge`: load existing YAML, diff fields — only add new fields, preserve manual edits to existing ones
  - Serialize using the `yaml` npm package (NOT `js-yaml` — js-yaml cannot emit comments)
  - Use `yaml`'s `Document` API to attach `commentBefore` strings to nodes
  - Comments per field: `# selector priority: name attr > aria-label > id > CSS` + `# type: <type>`
  - For unsupported fields: `# UNSUPPORTED: file upload not supported in V1`
  - `--merge` mode: parse existing file with `yaml.parseDocument()` (preserves user comments),
    diff top-level field keys, insert only new fields at the bottom of each section
- [ ] Wire up `discover` subcommand in `src/cli/index.ts` to call crawler → schema builder → YAML writer

### Verification

```bash
npm run form-api -- discover --url https://www.w3schools.com/html/html_forms.asp --out workflows/test.yaml
cat workflows/test.yaml
# Should be readable YAML with inline comments

npm run form-api -- discover --url https://www.w3schools.com/html/html_forms.asp --out workflows/test.yaml
# Should error: "File exists. Use --overwrite..."

npm run form-api -- discover --url https://www.w3schools.com/html/html_forms.asp --out workflows/test.yaml --overwrite
# Should succeed silently
```

### Exit Criteria

- [ ] `workflow.yaml` generated with all detected fields
- [ ] YAML includes inline comments per field
- [ ] `discovered: partial` present when multi-step form detected
- [ ] `--overwrite` replaces, `--merge` adds only new fields, default errors on existing file
- [ ] Generated YAML passes Zod validation (`WorkflowConfigSchema.parse()`)
- [ ] TypeScript compiles without errors

---

## Step 4 — Zod Loader + WorkflowInput Adapter

**Branch:** `feat/form-api-loader`
**PR title:** `feat: workflow YAML loader and WorkflowInput adapter`
**Model tier:** default
**Depends on:** Step 3
**Parallel with:** Step 5

### Context Brief

Two independent concerns in one PR:

**Loader:** Reads a `workflow.yaml` file from disk and validates it against
`WorkflowConfigSchema` (defined in Step 3). Returns a typed `WorkflowConfig`.
On validation failure: print field-level Zod errors and exit 1.

**Adapter:** Converts a `WorkflowConfig` + a JSON request body into the existing
`WorkflowInput` type (defined in `src/workflow/types.ts`). This is the bridge
between the new config-driven world and the existing execution engine.

Key existing type to understand: `WorkflowInput` in `src/workflow/types.ts`.
The adapter evaluates `{{ input.fieldName }}` template expressions in field
`value` strings against the request body.

### Tasks

- [ ] Create `src/workflow-loader/loader.ts`
  - Export `loadWorkflow(filePath: string): Promise<WorkflowConfig>`
  - Read file, parse YAML with `yaml.parse()` (the `yaml` npm package), validate with `WorkflowConfigSchema`
  - On error: surface Zod issues in human-readable format, throw
- [ ] Create `src/workflow-loader/adapter.ts`
  - Export `adaptToWorkflowInput(config: WorkflowConfig, requestBody: Record<string, unknown>): WorkflowInput`
  - Template evaluation: replace `{{ input.X }}` with `requestBody.X` (simple string replace, no full template engine needed)
  - Apply `default` values from `config.input.properties` for missing optional fields
- [ ] Create `src/workflow-loader/validator.ts`
  - Export `validateRequestBody(config: WorkflowConfig, body: unknown): { valid: boolean; errors?: string[] }`
  - Validates body against `config.input` JSON Schema (use Zod dynamically built from `input.properties`)

### Verification

```bash
# Create a minimal test workflow YAML manually, then:
npx ts-node -e "
  const { loadWorkflow } = require('./src/workflow-loader/loader');
  loadWorkflow('workflows/test.yaml').then(c => console.log(JSON.stringify(c, null, 2)));
"
# Should print parsed config

npx ts-node -e "
  const { adaptToWorkflowInput } = require('./src/workflow-loader/adapter');
  // Test with a config + body
"
```

### Exit Criteria

- [ ] `loadWorkflow()` returns typed `WorkflowConfig` for a valid YAML file
- [ ] `loadWorkflow()` throws with readable errors for invalid YAML
- [ ] `adaptToWorkflowInput()` resolves `{{ input.X }}` templates correctly
- [ ] Missing required fields in request body reported by `validateRequestBody()`
- [ ] Default values applied for optional fields not in request body
- [ ] TypeScript compiles without errors

---

## Step 5 — Workflow Registry + Dynamic Route Registration

**Branch:** `feat/form-api-registry`
**PR title:** `feat: workflow registry with dynamic route registration`
**Model tier:** default
**Depends on:** Step 4 (needs `loadWorkflow()` and `validateRequestBody()`)
**Parallel with:** nothing

### Context Brief

The workflow registry watches the `./workflows/` directory. For each `*.yaml` file
found, it loads the workflow (using the loader from Step 4, which this step runs
after) and registers a route `POST /api/{workflow-name}` on the existing Express
server in `src/api/server.ts`.

Since Step 4 and Step 5 run in parallel, Step 5 should define a simple stub for
the loader call that can be wired up once both PRs are merged. Alternatively,
both PRs merge to `main` before integration — use a feature flag comment.

Key existing file: `src/api/server.ts` — already rewritten to Express in Step 1.
Import the exported `app` instance from `server.ts` to register routes on it.
Import `loadWorkflow` from `src/workflow-loader/loader.ts` (Step 4) and
`validateRequestBody` from `src/workflow-loader/validator.ts` (Step 4) — both
must be available before this step starts.

### Tasks

- [ ] Create `src/api/workflow-registry.ts`
  - Export `WorkflowRegistry` class
  - `constructor(workflowsDir: string, app: Express)`
  - `async load(): Promise<void>` — scans dir, loads each YAML, registers routes
  - `registerRoute(config: WorkflowConfig): void` — adds `POST /api/:name` to express app
  - `GET /api` route — returns array of `{ name, inputSchema }` for all loaded workflows
  - `GET /api/:name/schema` route — returns the `input` JSON Schema for a workflow
- [ ] Extend `src/api/server.ts`
  - Import and instantiate `WorkflowRegistry` on server start
  - Pass express `app` instance to registry
  - Add `--workflows` CLI flag support (default: `./workflows`)
- [ ] Wire up `serve` subcommand in `src/cli/index.ts` to start the server with registry

### Verification

```bash
# With a workflow YAML in ./workflows/:
npm run form-api -- serve

curl http://localhost:3000/api
# Should return [{ name: "test", inputSchema: {...} }]

curl http://localhost:3000/api/test/schema
# Should return the input JSON Schema

curl -X POST http://localhost:3000/api/test -H "Content-Type: application/json" -d '{"name":"Sam"}'
# Should return 202 with runId (execution wired in Step 6)
# For now: 501 Not Implemented is acceptable
```

### Exit Criteria

- [ ] `GET /api` lists all workflows in `./workflows/`
- [ ] `GET /api/:name/schema` returns correct input schema
- [ ] `POST /api/:name` with invalid body returns 400 with field errors
- [ ] `POST /api/:name` for unknown workflow returns 404
- [ ] Existing server endpoints (`/health`, `/queue`, `/run`) still work
- [ ] TypeScript compiles without errors

---

## Step 6 — Async Execution + Queue Integration

**Branch:** `feat/form-api-async-execution`
**PR title:** `feat: async form submission via existing queue`
**Model tier:** default
**Depends on:** Step 4 + Step 5 (both merged)
**Parallel with:** nothing

### Context Brief

Wire `POST /api/:name` to actually run the automation. The flow:
1. Validate request body against workflow input schema
2. Enqueue a job (reuse `src/api/queue.ts` — existing file-backed queue)
3. Return `202 Accepted` with `{ runId, status: "queued", pollUrl }`
4. Queue worker (existing cron) picks up the job, calls the execution engine

The existing queue in `src/api/queue.ts` stores jobs in `queue.json`. Read it
carefully before modifying — the current `QueueItem` type has no `id` field and
`markDone()` identifies items by domain-field matching (not by ID). This step
must extend the queue in a **backwards-compatible way**.

Key existing files: `src/api/queue.ts`, `src/api/cron.ts`, `src/main.ts`,
`src/orchestration/orchestrator.ts`.

### Tasks

- [ ] **Extend `src/api/queue.ts` (backwards-compatible)**
  - Add optional `id?: string` field to `QueueItem` — existing items without `id` still work
  - Add `enqueueWorkflow(workflowName: string, input: WorkflowInput): string`:
    - Generates `runId` via `crypto.randomUUID()` (Node built-in, no extra dep)
    - Writes job with `{ id: runId, type: "workflow", workflowName, input, status: "pending" }`
    - Returns `runId`
  - Add `findById(id: string): QueueItem | null` — reads `queue.json`, finds by `id`
  - Extend `markDone(item)` to accept an optional `result` payload stored on the item:
    `markDone(item: QueueItem, result?: WorkflowRunResult): void`
  - Existing `enqueue()` / `popNext()` / `markDone()` (old signature) remain working
- [ ] Create `src/workflow-runner.ts`
  - Export `runWorkflow(workflowName: string, input: WorkflowInput): Promise<WorkflowRunResult>`
  - Loads workflow YAML from `./workflows/${workflowName}.yaml`
  - Adapts input via `adaptToWorkflowInput()`
  - Opens browser via `src/session.ts`
  - Passes to existing orchestrator
  - Extracts result from DOM using `success_selector`
  - Returns `{ runId, status, message, tiersUsed, durationMs }`
- [ ] Extend `src/api/cron.ts` to handle workflow job type (dispatch to `runWorkflow()`)
- [ ] Wire `POST /api/:name` in registry to call `enqueueWorkflow()` and return 202

### Verification

```bash
npm run form-api -- serve &

curl -X POST http://localhost:3000/api/test \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Sam","lastName":"Test"}'
# Expected: 202 { "runId": "run-...", "status": "queued", "pollUrl": "..." }

npm run cron &
# Cron should pick up the job and run the automation
```

### Exit Criteria

- [ ] `POST /api/:name` returns 202 with `runId`
- [ ] Job appears in queue with status `pending`
- [ ] Cron processes workflow jobs (dispatches to `runWorkflow()`)
- [ ] Browser opens and fills the form
- [ ] Job transitions to `done` or `failed` after cron run
- [ ] `src/api/queue.ts` existing behaviour is unchanged for non-workflow jobs
- [ ] TypeScript compiles without errors

---

## Step 7 — Status Polling + Result Extraction

**Branch:** `feat/form-api-status-polling`
**PR title:** `feat: run status polling and DOM result extraction`
**Model tier:** default
**Depends on:** Step 6
**Parallel with:** nothing

### Context Brief

Two things:

**Status polling:** `GET /api/:name/runs/:runId` reads from the JSONL audit log
(existing `src/logger.ts` output) or from `queue.json` to return run status.
`GET /api/:name/runs` returns all runs for a workflow.

**Result extraction:** After form submission, read the DOM for `success_selector`.
If found: `status: success`, `message: <text content>`.
If not found and URL changed: `status: success` (heuristic), `message: "URL changed after submit"`.
If neither: `status: ambiguous`, `message: "No confirmation detected"`.

The logger already writes per-event JSONL lines. Add a `workflowName` field to
log lines emitted from `runWorkflow()` so they can be filtered by workflow.

### Tasks

- [ ] Create `src/api/runs.ts`
  - Export `getRunStatus(workflowName: string, runId: string): RunStatus | null`
  - Read `queue.json` for the job record (status + result fields)
  - Export `listRuns(workflowName: string): RunStatus[]`
  - Filter queue history by `workflowName`
- [ ] Register routes in `WorkflowRegistry`:
  - `GET /api/:name/runs` → `listRuns()`
  - `GET /api/:name/runs/:runId` → `getRunStatus()`
- [ ] Implement DOM result extraction in `src/workflow-runner.ts`
  - After orchestrator completes, use Playwright to read `success_selector` text
  - If `success_selector` not found: check if URL changed vs start URL
  - Return `status: success | failed | ambiguous` + `message`
- [ ] Store result on queue job record: extend `markDone()` to accept `result` payload
- [ ] Add `workflowName` to logger calls in `src/workflow-runner.ts`

### Verification

```bash
# After triggering a run:
curl http://localhost:3000/api/test/runs
# Expected: array of run records with status

curl http://localhost:3000/api/test/runs/run-1743891234
# Expected: { runId, status, message, tiersUsed, durationMs }

# For an ambiguous result (no success_selector match):
# Expected: { status: "ambiguous", message: "No confirmation detected" }
```

### Exit Criteria

- [ ] `GET /api/:name/runs/:runId` returns correct status for queued/running/done/failed runs
- [ ] `GET /api/:name/runs` lists all runs for a workflow
- [ ] `status: ambiguous` returned when neither success_selector nor URL change detected
- [ ] `status: success` with correct message when `success_selector` matches
- [ ] TypeScript compiles without errors

---

## Step 8 — Login Flow + Cookie Persistence

**Branch:** `feat/form-api-login`
**PR title:** `feat: manual login flow and cookie jar persistence`
**Model tier:** default
**Depends on:** Step 7
**Parallel with:** Step 9

### Context Brief

The login flow lets users authenticate to a target site manually in a headed browser,
then saves cookies for reuse in subsequent headless runs.

UX flow for `form-api login --workflow <name>`:
1. Read `workflow.yaml` to get the target URL
2. Open Playwright Chromium in **headed** mode
3. Navigate to URL
4. Print to terminal: "Log in manually, then press Enter to save your session..."
5. Wait for user to press Enter (`process.stdin.once('data', ...)`)
6. Extract cookies via `context.cookies()`
7. Write to `.cookies/<workflow-name>.json`
8. Close browser

On subsequent `runWorkflow()` calls: if `auth.strategy === "cookie_jar"` and
`.cookies/<name>.json` exists, load cookies into the browser context before
navigating. CSRF tokens are NOT stored — they're read fresh from the DOM each
submission via `page.evaluate()` if `config.auth.csrf_selector` is set.

### Tasks

- [ ] Create `src/auth/cookie-store.ts`
  - Export `saveCookies(workflowName: string, cookies: Cookie[]): Promise<void>`
  - Export `loadCookies(workflowName: string): Promise<Cookie[] | null>` (null if file absent)
  - Storage path: `.cookies/<workflowName>.json`
- [ ] Create `src/auth/login.ts`
  - Export `runLoginFlow(workflowName: string): Promise<void>`
  - Implements the headed flow described above
- [ ] Extend `src/session.ts` or `src/workflow-runner.ts`
  - Before navigating: if `config.auth?.strategy === 'cookie_jar'`, call `loadCookies()`
    and `context.addCookies()`
- [ ] Add `csrf_selector` optional field to `WorkflowConfig.auth` type
  - If set: before each submission, `page.evaluate(() => document.querySelector(sel).value)`
    and inject into the submit action
- [ ] Wire `login` subcommand in `src/cli/index.ts` to `runLoginFlow()`
- [ ] Add `.cookies/` to `.gitignore` (verify it's there from Step 1)

### Verification

```bash
npm run form-api -- login --workflow test
# Expected: headed browser opens, "press Enter" message, cookies saved

ls .cookies/
# Expected: test.json

# Subsequent run should reuse session:
curl -X POST http://localhost:3000/api/test -d '{"name":"Sam"}'
# Should not hit login page
```

### Exit Criteria

- [ ] `form-api login` opens headed browser and waits for Enter
- [ ] Cookies saved to `.cookies/<name>.json` after Enter pressed
- [ ] `runWorkflow()` loads cookies before navigating when `auth.strategy === 'cookie_jar'`
- [ ] `.cookies/` is gitignored
- [ ] TypeScript compiles without errors

---

## Step 9 — Event Dispatch + Stale Config Detection

**Branch:** `feat/form-api-resilience`
**PR title:** `feat: JS event dispatch and stale config detection`
**Model tier:** default
**Depends on:** Step 7
**Parallel with:** Step 8

### Context Brief

Two resilience improvements that can run in parallel with Step 8:

**Event dispatch (FR-013):** After `page.fill()`, dispatch `change` and `blur`
events for fields that have `dispatch_events: [change, blur]` in their YAML config.
This satisfies React/Vue controlled inputs and form validation that fires on these
events. Use `page.dispatchEvent(selector, 'change')`.

**Stale detection (FR-012):** At the start of each `runWorkflow()` call (before
filling), re-crawl the form's selectors and diff against the workflow YAML.
If any selector no longer resolves to an element: log a `stale_config:warn` event
to the audit log with the affected fields. Do NOT fail the run — log and continue.
Skip stale detection for workflows with `discovered: partial`.

### Tasks

- [ ] Extend `src/workflow/helpers.ts` (or `src/workflow-runner.ts`)
  - After each `page.fill()` call, check if field config has `dispatch_events`
  - If so: `await page.dispatchEvent(selector, 'change')` and `blur` as configured
- [ ] Create `src/discover/stale-detector.ts`
  - Export `detectStaleSelectors(page: Page, config: WorkflowConfig): Promise<StaleField[]>`
  - For each field selector in config: `await page.locator(selector).count()` — if 0, it's stale
  - Skip if `config.discovered === 'partial'`
  - Returns `StaleField[]`: `{ fieldId, selector, reason: 'not_found' }`
- [ ] Integrate stale detection at start of `runWorkflow()`:
  - After page load, before filling: call `detectStaleSelectors()`
  - If any stale fields found: `logger.log('workflow-runner', 'stale_config:warn', { fields })`
  - Continue run regardless
- [ ] Add `StaleField[]` to `WorkflowRunResult` so callers can see warnings

### Verification

```bash
# Manually set a selector in workflow YAML to something that doesn't exist:
# selector: "[name='nonexistent']"

curl -X POST http://localhost:3000/api/test -d '{"name":"Sam"}'
# Run should complete (not fail)

# Check audit log:
cat logs/run-*.jsonl | grep stale_config
# Expected: stale_config:warn event with affected field
```

### Exit Criteria

- [ ] `change`/`blur` events dispatched for fields with `dispatch_events` configured
- [ ] Stale selectors detected and logged as `stale_config:warn` before each run
- [ ] Run does not fail due to stale detection — it continues
- [ ] Stale detection skipped for `discovered: partial` workflows
- [ ] `WorkflowRunResult` includes `staleFields` array
- [ ] TypeScript compiles without errors

---

## Invariants (Verified After Every Step)

These must hold throughout all PRs — check before merging each branch:

1. `npm run dev` still works (existing healthcare form demo)
2. `npm run server` still starts without errors
3. `npx tsc --noEmit` passes with zero errors
4. No existing `src/` files modified without explicit reason in PR description
5. `logs/` and `debug/` remain gitignored
6. `.cookies/` is gitignored

---

## Plan Mutation Protocol

If a step needs to change after work has started:

- **Split:** Add new step file, update dependency edges, note in this file under `## Amendments`
- **Skip:** Mark step `[SKIPPED: reason]`, verify downstream steps still make sense
- **Reorder:** Update dependency graph, check no circular dependencies introduced
- **Abandon:** Mark `[ABANDONED: reason]`, document what was partially done

All mutations recorded under `## Amendments` at the bottom of this file.

---

## Amendments

**2026-04-06 — Adversarial review findings (applied before finalisation)**

| # | Issue | Severity | Resolution |
|---|---|---|---|
| A1 | `src/api/server.ts` uses raw `http`, not Express — dynamic routes impossible | CRITICAL | Step 1 now adds Express and rewrites server.ts, preserving all existing endpoints |
| A2 | Steps 4+5 originally parallel — Step 5 cannot function without Step 4's loader/validator | CRITICAL | Steps now sequential: Step 5 depends on Step 4 |
| A3 | `queue.ts` has no `id` field — `runId`-based lookup impossible | HIGH | Step 6 adds backwards-compatible `id` field, `findById()`, and extended `markDone()` |
| A4 | `session.ts` returns `Page` not `BrowserContext`; `headless: false` hardcoded | HIGH | Step 1 refactors `createSession()` to return `{ page, context }` with `headed` option |
| A5 | `js-yaml` cannot emit inline comments — YAML writer would produce plain YAML | HIGH | Step 3 uses `yaml` npm package (Document API supports `commentBefore` on nodes) |
