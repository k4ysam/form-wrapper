# form-wrapper

Turn any web form into a callable REST API — no custom Playwright code required.

Point `form-api discover` at a URL. It crawls the form, infers field types and selectors, and writes a `workflow.yaml`. Start `form-api serve` and that YAML becomes a live `POST /api/{name}` endpoint. Send JSON, get a `runId` back, poll for the result.

---

## How it works

```
form-api discover --url https://example.com/form --out workflows/my-form.yaml
form-api serve
curl -X POST http://localhost:3000/api/my-form -d '{"firstName":"Sam","lastName":"Doe"}'
# → { "runId": "run-17438...", "status": "queued", "pollUrl": "/api/my-form/runs/run-17438..." }
```

Under the hood, submissions run through a 3-tier pipeline: a deterministic Playwright engine fills the form first (zero LLM calls on the happy path), an AI recovery layer fixes any mismatches, and a human-in-the-loop fallback catches anything the AI can't resolve.

---

## Setup

**Requirements:** Node.js 18+, a Gemini API key

```bash
npm install
npx playwright install chromium
```

Create a `.env` file:

```
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
FORM_URL=https://your-target-form.com
```

---

## CLI

### `form-api discover`

Crawls a form URL and generates an annotated `workflow.yaml`.

```bash
npm run form-api -- discover --url https://example.com/form --out workflows/my-form.yaml
```

| Flag | Description | Default |
|---|---|---|
| `--url` | Form URL to crawl | required |
| `--out` | Output path for workflow YAML | `workflows/workflow.yaml` |
| `--headed` | Run browser in headed mode | false |
| `--overwrite` | Replace existing file | false |
| `--merge` | Add new fields, preserve manual edits | false |

The generated YAML has inline comments explaining each selector and how to fix it.

---

### `form-api serve`

Starts the HTTP server. Reads all `*.yaml` files from the workflows directory and registers a `POST /api/{name}` endpoint for each.

```bash
npm run form-api -- serve --port 3000 --workflows ./workflows
```

---

### `form-api login`

Opens a headed browser for manual login, then saves the session cookies for reuse in headless runs.

```bash
npm run form-api -- login --workflow my-form
```

Cookies are saved to `.cookies/my-form.json`. Add `auth: { strategy: cookie_jar }` to the workflow YAML to enable cookie injection on subsequent runs.

---

## API

### Submit a workflow

**`POST /api/{name}`**

```json
// Request
{ "firstName": "Sam", "lastName": "Doe" }

// Response — 202 Accepted
{
  "runId": "run-1743891234-abc123",
  "status": "queued",
  "pollUrl": "/api/my-form/runs/run-1743891234-abc123"
}
```

### Poll for result

**`GET /api/{name}/runs/{runId}`**

```json
{
  "runId": "run-1743891234-abc123",
  "workflowName": "my-form",
  "queueStatus": "done",
  "result": {
    "status": "success",
    "message": "Form submitted successfully.",
    "tiersUsed": ["deterministic"],
    "durationMs": 3800
  }
}
```

### Other endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api` | List all registered workflows and their input schemas |
| `GET` | `/api/{name}/schema` | Input JSON schema for a workflow |
| `GET` | `/api/{name}/runs` | All runs for a workflow, newest first |
| `POST` | `/run` | Trigger the legacy demo workflow directly |
| `GET` | `/health` | Health check |

---

## Workflow YAML

The generated YAML is the source of truth for both the API schema and automation behaviour. It's human-editable.

```yaml
version: "1"
name: my-form
description: "Auto-discovered workflow for https://example.com/form"
url: "https://example.com/form"
discovered: complete

input:
  type: object
  required: [firstName, lastName]
  properties:
    firstName: { type: string }
    lastName:  { type: string }
    email:     { type: string }

sections:
  - id: main
    fields:
      # selector priority: name attr > aria-label > data-testid > id > CSS
      # type: text
      - id: firstName
        selector: "[name='firstName']"
        type: text
        value: "{{ input.firstName }}"
        required: true
        dispatch_events: [change, blur]

  - id: submit
    type: submit
    selector: "[type='submit']"
    success_selector: ".confirmation-message"
    timeout_ms: 30000

recovery:
  tiers: [name_attr, aria_label, llm_locate]
  llm_budget: 4
```

**Template expressions** (`{{ input.X }}`) are resolved from the POST request body at submission time.

**`dispatch_events`** fires `change`/`blur` after filling — required for React and Vue forms.

**`success_selector`** is read from the DOM after submission to confirm success. If absent, a URL-change heuristic is used.

---

## Auth

For forms behind a login wall:

```bash
# 1. Save session cookies
npm run form-api -- login --workflow my-form

# 2. Add to workflow YAML
auth:
  strategy: cookie_jar
  cookie_file: ".cookies/my-form.json"
```

Cookies are loaded before each run. CSRF tokens are read fresh from the DOM each time via `csrf_selector`.

---

## Resilience

**Stale selector detection** — before each run, all selectors are checked against the live DOM. Dead selectors are logged as `stale_config:warn` in the audit log. The run continues.

**AI recovery** — when the deterministic engine fills a field incorrectly, a targeted Gemini prompt fixes only the failing fields. Capped at 4 LLM calls per run.

**Human fallback** — if AI recovery fails or the budget is exhausted, execution pauses and prints a field-by-field prompt to the terminal for manual correction.

---

## Audit logs

Every run writes to `logs/run-<timestamp>.jsonl`. Events include field fills, checkpoint results, AI calls, stale warnings, and the final result.

```bash
cat logs/run-*.jsonl | grep stale_config   # stale selector warnings
cat logs/run-*.jsonl | grep workflow:result # final outcome per run
```
