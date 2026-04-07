# Form-Based API Wrapper Generator

> **Samaksh · February 2026**

---

The system is built deterministic-first: a Playwright engine fills the form with zero LLM calls on the happy path, and Gemini is only invoked when a post-section checkpoint detects a mismatch. This turned out to be the right architecture for reliability and cost reasons, not just free-tier quota management.

Please read **[APPROACH.md](APPROACH.md)** for the full thought process — why the design evolved this way and honest tradeoffs. For an account of important commits and how the project was built, see **[Progress.md](Progress.md)**. This README covers how to run everything and how the codebase is structured.

---

## Table of Contents

1. [Setup](#setup)
2. [Quick Start](#quick-start)
3. [How to Run Everything](#how-to-run-everything)
   - [Single CLI Run](#1-single-cli-run)
   - [Variable Injection via CLI](#2-variable-injection-via-cli)
   - [HTTP API Server](#3-http-api-server)
   - [Helper Scripts for API Calls](#4-helper-scripts-for-api-calls)
   - [Queue + Cron Scheduler](#5-queue--cron-scheduler)
   - [Test Scenarios](#6-test-scenarios)
4. [All Available Fields](#all-available-fields)
5. [Codebase Internals](#codebase-internals)
6. [Audit Logs](#audit-logs)
7. [Troubleshooting](#troubleshooting)


---

## Setup

**Install dependencies (Node.js 18+):**

```bash
npm install
npx playwright install
```

Create a `.env` file in the project root and add your Gemini API key:

```
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here
```

The app loads this via `dotenv-defaults`; without it, any run that needs the AI tier (e.g. recovery or run summary) will fail.

---

## Quick Start

With `.env` configured, run:

```bash
npm run dev
```

A Playwright browser opens, fills the healthcare form across all three sections, and prints a run summary. On clean, well-formatted input: **0 LLM calls used**.

---

## How to Run Everything

### 1. Single CLI Run

```bash
npm run dev
```

Runs the full workflow with the default SOP values (John Doe, DOB 1990-01-15, Medical ID 91927885, plus gender, blood type, and emergency contact). The browser opens visibly so you can watch the form being filled in real time.

---

### 2. Variable Injection via CLI

Override any field by passing `key=value` arguments:

```bash
# PowerShell
npm run trigger -- firstName=Samuel lastName=Kalt dateOfBirth=1985-06-20 medicalId=12345678 gender=Male bloodType="O+" allergies="Penicillin, Shellfish" medications="Metformin 500mg" emergencyContact="Rachel Kalt" emergencyPhone=212-555-0199
```

Any field you omit falls back to the default SOP value. If you omit all Section 2 fields (`gender`, `bloodType`, `allergies`, `medications`), Section 2 is skipped entirely — same for Section 3.

---

### 3. HTTP API Server

Start the server in one terminal, then trigger runs from another.

> **Platform note:** The examples below use PowerShell (`Invoke-WebRequest`) — tested on Windows. Mac/Linux equivalents using `curl` are shown alongside each block; the `curl` syntax is standard and should work, though I have not personally tested on those platforms.

**Terminal 1 — start the server:**
```bash
npm run server
# Listening on http://localhost:3000
```

**Trigger an immediate run:**

```powershell
# PowerShell — SOP defaults
Invoke-WebRequest -Uri http://localhost:3000/run -Method POST

# PowerShell — with overrides
Invoke-WebRequest -Uri http://localhost:3000/run -Method POST `
  -ContentType "application/json" `
  -Body '{"firstName":"Samuel","lastName":"Kalt","medicalId":"99999999"}'
```

```bash
# Mac/Linux (curl) — SOP defaults
curl -s -X POST http://localhost:3000/run

# Mac/Linux (curl) — with overrides
curl -s -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Samuel","lastName":"Kalt","medicalId":"99999999"}'
```


**All endpoints:**

| Method | Path | Description |
|---|---|---|
| `POST` | `/run` | Trigger workflow immediately (202 Accepted, runs async) |
| `POST` | `/enqueue` | Add a patient run to the queue |
| `GET` | `/queue` | View queue status (pending / processing / done / failed) |
| `GET` | `/health` | Health check → `{ "status": "ok" }` |

---

### 4. Helper Scripts for API Calls

A convenience script in `scripts/` let you pass `key=value` arguments directly without writing JSON by hand.

**PowerShell (`scripts/trigger-api.ps1`):**
```powershell
.\scripts\trigger-api.ps1 `
  -firstName Samuel `
  -lastName Kalt `
  -dateOfBirth "20 March 1985" `
  -medicalId 12345678 `
  -gender Male `
  -bloodType "O+" `
  -allergies "Penicillin, Shellfish" `
  -medications "Metformin 500mg" `
  -emergencyContact "Rachel Kalt" `
  -emergencyPhone "212-555-0199"
  ```

It builds the JSON body from the arguments and POST it to the running server on `localhost:3000`. The server must be running (`npm run server`) before using it. Any field not specified falls back to defaults server-side.

---

### 5. Queue + Cron Scheduler

The queue lets you batch-submit patient runs that drain automatically on a schedule.

**Terminal 1 — start the server:**
```bash
npm run server
```

**Terminal 2 — add runs to the queue:**
```powershell
# Enqueue with default values
Invoke-WebRequest -Uri http://localhost:3000/enqueue -Method POST

# Enqueue with overrides
Invoke-WebRequest -Uri http://localhost:3000/enqueue -Method POST `
  -ContentType "application/json" `
  -Body '{"firstName":"Sam","lastName":"Jones","dateOfBirth":"1995-05-05","medicalId":"77665544"}'

# Check queue state
Invoke-WebRequest -Uri http://localhost:3000/queue
```

```bash
# Mac/Linux (curl) — enqueue with default values
curl -s -X POST http://localhost:3000/enqueue

# Mac/Linux (curl) — enqueue with overrides
curl -s -X POST http://localhost:3000/enqueue \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Sam","lastName":"Jones","dateOfBirth":"1995-05-05","medicalId":"77665544"}'

# Mac/Linux (curl) — check queue state
curl -s http://localhost:3000/queue
```

**Terminal 3 — start the cron drain:**
```bash
npm run cron
```

The cron job runs every minute and processes one pending item per tick (`pending → processing → done/failed`). Queue state is persisted to `queue.json` and survives restarts.

---

### 6. Test Scenarios

```bash
npm run test:scenarios
```

Runs **8 scenarios** split into two groups:

**Happy-Path (TC-01 → TC-05)** — run directly, 0 LLM calls expected:

| ID | Name | What it covers |
|---|---|---|
| TC-01 | Full valid run — all sections | All 3 sections, clean data |
| TC-02 | Section 1 only | No optional sections |
| TC-03 | Section 1 + 2, no emergency contact | Section 3 skipped |
| TC-04 | Case-insensitive deterministic resolution | `FEMALE`, `o+` — engine handles without AI |
| TC-05 | Incomplete emergency contact pair | Only one of the two fields — Section 3 skipped cleanly |

**AI-Recovery (TC-06 → TC-08)** — enqueued for `npm run cron`, ~2 LLM calls each:

| ID | Name | What the AI must fix |
|---|---|---|
| TC-06 | Natural-language DOB + full-form blood type | `"March 3rd, 1992"` → `1992-03-03`; `"B negative"` → `B-` |
| TC-07 | Gender typo + ambiguous blood type | `"Femal"` → `Female`; `"AB"` → `AB+` or `AB-` |
| TC-08 | European DOB + abbreviated gender + long-form blood type | `"29/02/1988"` → `1988-02-29`; `"F"` → `Female`; `"O positive"` → `O+` |

The runner executes happy-path scenarios directly in sequence, then enqueues the AI-recovery scenarios into `queue.json`. Start `npm run cron` in a separate terminal to drain the AI-recovery runs.

---

## All Available Fields

| Field | Section | Default SOP value | Notes |
|---|---|---|---|
| `firstName` | 1 | `John` | Required |
| `lastName` | 1 | `Doe` | Required |
| `dateOfBirth` | 1 | `1990-01-15` | Format: `YYYY-MM-DD` |
| `medicalId` | 1 | `91927885` | Required |
| `gender` | 2 | `Male` | Omit to skip Section 2 |
| `bloodType` | 2 | `O+` | Omit to skip Section 2 |
| `allergies` | 2 | `Peanuts` | Optional within Section 2 |
| `medications` | 2 | `Aspirin` | Optional within Section 2 |
| `emergencyContact` | 3 | `Jane Doe` | Both fields required for Section 3 |
| `emergencyPhone` | 3 | `555-123-4567` | Both fields required for Section 3 |

---

## Codebase Internals

This section explains how the files fit together. Grouped by layer, from entry point down to supporting utilities.

---

### Entry & Session

**`src/main.ts`**
The top-level entry point. Accepts a `Partial<WorkflowInput>` and merges it with hardcoded SOP defaults. Creates the Playwright session, wires up the logger, and calls the orchestrator. Everything flows through here.

**`src/_internal/run.ts`**
The file behind `npm run dev`. Just calls `main()` with no overrides, using the full SOP defaults.

**`src/session.ts`**
Creates and returns a Playwright Chromium browser + page. Navigates to the form URL. The only place browser lifecycle is managed.

**`src/_internal/setup.ts`**
Initialises the Gemini model (`gemini-2.5-flash`) via the Vercel AI SDK. Imported by each AI agent.

---

### Orchestration

**`src/orchestration/orchestrator.ts`**
The top-level sequencer. Creates a `RunBudget(4)` instance, then runs four sections in order: Personal Information → Medical Information → Emergency Contact → Submit. Collects a `SectionOutcome` for each. When all sections are done, calls `summary.ts` to generate and log the final run summary.

**`src/orchestration/sectionRunner.ts`**
Implements the 3-tier pipeline for a single section. Called by the orchestrator once per section. Runs the deterministic engine first, then the checkpoint, then the AI agent (if budget is available), then human fallback. Returns a `SectionOutcome` with the resolution type.

**`src/orchestration/budget.ts`**
A simple class that tracks how many LLM calls have been made in this run. Hard cap of 4. `budget.available()` returns false when the cap is reached, causing `sectionRunner` to skip the AI tier and go straight to human fallback.

**`src/orchestration/humanFallback.ts`**
Prints a field-by-field prompt to the terminal when AI recovery fails or budget is exhausted. Shows the selector, expected value, actual DOM value, and format hints for each failing field. Waits for the operator to press Enter before continuing.

**`src/orchestration/fieldMeta.ts`**
Lookup table of human-readable labels and format hints for each field selector. Used by `humanFallback.ts` to produce readable prompts instead of raw CSS selectors.

**`src/orchestration/summary.ts`**
Generates the end-of-run summary. If LLM budget is available, calls Gemini with the full list of section outcomes to produce a natural-language description. If budget is exhausted, assembles a deterministic summary from the outcome tags instead.

**`src/orchestration/types.ts`**
Shared type definitions: `SectionOutcome` (section name + resolution type + any failing fields) and `HandoffContext` (passed between sections).

---

### Deterministic Engine

**`src/engine.ts`**
The core step runner. Iterates a list of `Step` objects. Each step has three functions: `observe` (precondition check), `act` (browser interaction), `verify` (post-condition assert). On verify failure, waits 300ms and retries once. On a second failure, writes a screenshot and raw HTML to `debug/` and moves on to the next step — partial progress is preserved rather than aborting.

**`src/workflow/helpers.ts`**
Factory functions for building steps: `makeFillStep`, `makeSelectStep`, `makeOpenSectionStep`, `fillWithFallback`, `assertInputValue`. Also contains the `buildSectionXSteps()` functions that produce the step list for each section from a `WorkflowInput`.

**`src/workflow/types.ts`**
Defines `WorkflowInput` (all ten fields, Sections 2 and 3 optional) and `CheckResult` (returned by checkpoints).

**`src/workflow/index.ts`**
Re-exports the public surface of the `workflow/` module.

---

### AI Agents & Checkpoints

**`src/agents/section1Agent.ts`**
Three things in one file: `buildSection1Steps()` (step list for Section 1), `checkSection1()` (checkpoint that reads DOM and diffs against expected input), and `runSection1Agent()` (AI sub-agent called with the failing-fields hint). Same pattern applies to sections 2 and 3.

**`src/agents/section2Agent.ts`** / **`src/agents/section3Agent.ts`**
Same structure as section1Agent. Section 2 adds `selectOption` to the tool set for dropdown handling.

**`src/agents/submitAgent.ts`**
Step list for the submit action + AI sub-agent for when the click fails. Verifies success by checking for the success message in the DOM.

**`src/tools/browserTools.ts`**
Defines the five tools available to AI agents — using the Vercel AI SDK `tool()` function with Zod schemas:
- `takeScreenshot` — reads live DOM values (URL, field values, visible labels), not a pixel image
- `fillField` — fills a text input or textarea by CSS selector
- `selectOption` — selects a dropdown option by visible label text, case-insensitive
- `clickElement` — clicks a button or element, scrolls into view first
- `scrollTo` — scrolls an element into the viewport

Each agent receives only the subset of tools relevant to its section.

---

### API & Scheduling

**`src/api/serve.ts`**
Entry point for `npm run server`. Starts the HTTP server.

**`src/api/server.ts`**
The HTTP server. Four endpoints: `POST /run` (trigger immediately, 202 Accepted), `POST /enqueue` (add to queue), `GET /queue` (status counts), `GET /health`.

**`src/api/queue.ts`**
File-backed queue using `queue.json`. Manages the `pending → processing → done/failed` lifecycle. Functions: `enqueue()`, `popNext()` (atomically marks first pending item as processing), `markDone()`, `queueSummary()`.

**`src/api/cron.ts`**
Entry point for `npm run cron`. Uses `node-cron` to call `popNext()` every minute and run `main()` on whatever it finds.

**`src/api/trigger.ts`**
Entry point for `npm run trigger`. Parses `key=value` command-line arguments into a `Partial<WorkflowInput>` and calls `main()` directly, bypassing the server.

**`scripts/trigger-api.ps1`** / **`scripts/trigger-api.sh`**
PowerShell and Bash scripts that accept `key=value` arguments, build a JSON body, and POST it to the running server. Convenience wrappers so you don't have to write JSON by hand.

---

### Logging & Tests

**`src/logger.ts`**
`AuditLogger` class. Opens a JSONL file at `logs/run-<runId>.jsonl` on construction. Every call to `.log(agent, event, data)` appends one JSON line and mirrors it to the console. Used by every layer of the system. Events include `pipeline:start`, `deterministic:pass`, `deterministic:fail`, `checkpoint:pass`, `checkpoint:fail`, `ai:invoke`, `ai:pass`, `ai:fail`, `ai:skipped`, `human:fallback`, `run:summary`, and per-step LLM details.

**`src/tests/scenarios.ts`**
Defines 8 test scenarios as typed objects (`id`, `name`, `note`, `input`). The `note` field is logged to the console by the runner but is never passed to any agent or LLM prompt.

**`src/tests/runner.ts`**
Runs happy-path scenarios (TC-01 to TC-05) directly in sequence. Enqueues AI-recovery scenarios (TC-06 to TC-08) into `queue.json` for processing by `npm run cron`.

---

### How It All Connects

```
npm run dev
  └── src/_internal/run.ts
        └── src/main.ts  (merges input + SOP defaults)
              ├── src/session.ts  (opens browser)
              ├── src/logger.ts   (opens log file)
              └── src/orchestration/orchestrator.ts
                    ├── src/orchestration/budget.ts
                    └── src/orchestration/sectionRunner.ts  (×4 sections)
                          ├── src/engine.ts
                          │     └── src/agents/sectionXAgent.ts → buildSectionXSteps()
                          ├── src/agents/sectionXAgent.ts → checkSectionX()
                          ├── src/agents/sectionXAgent.ts → runSectionXAgent()
                          │     └── src/tools/browserTools.ts
                          │     └── src/_internal/setup.ts  (Gemini model)
                          └── src/orchestration/humanFallback.ts
                                └── src/orchestration/fieldMeta.ts
```

---

## Audit Logs

Every run writes to `logs/run-<timestamp>.jsonl`. Each line is one event:

```jsonl
{"ts":"...","runId":"...","agent":"orchestrator","event":"pipeline:start","data":{}}
{"ts":"...","runId":"...","agent":"section1","event":"deterministic:pass","data":{}}
{"ts":"...","runId":"...","agent":"section2","event":"ai:invoke","data":{"hint":"..."}}
{"ts":"...","runId":"...","agent":"section2","event":"ai:pass","data":{}}
{"ts":"...","runId":"...","agent":"orchestrator","event":"run:summary","data":{"summary":"..."}}
```

The `logs/` and `debug/` directories are git-ignored. `debug/` gets a screenshot and HTML dump whenever a deterministic step fails on its second attempt — useful for diagnosing selector issues.

---

## Troubleshooting

**Chromium closes during human-in-the-loop.** If the browser window keeps closing while you're fixing fields manually, try restarting your computer or Chrome (if you're using a Chromium-based browser for other work). This often clears stuck Playwright/Chromium state.

---
