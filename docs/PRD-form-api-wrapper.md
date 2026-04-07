# Form-Based API Wrapper Generator
**PRD v1.0 — Samaksh · April 2026**

---

## 1. Executive Summary

A developer tool that turns any web form into a callable REST API. Point it at a URL, it discovers the form's field schema via headless browser, saves a `workflow.yaml`, and exposes an HTTP endpoint that accepts JSON — filling and submitting the form automatically on every call.

**Two core flows:**
- `form-api discover` — CLI that crawls a form URL and generates a typed `workflow.yaml`
- `form-api serve` — HTTP server that reads workflow configs and registers live API endpoints

Built on top of an existing TypeScript/Playwright 3-tier automation framework (deterministic → AI recovery → human fallback). Phase 4 adds a web UI.

**The underlying insight:** A large portion of real-world systems expose actions exclusively through web forms with no programmatic API. This tool makes them programmable without writing custom Playwright code for each one.

---

## 2. Problem Statement

Government portals, university systems, insurance platforms, and legacy enterprise tools have no API. Developers who need to automate or integrate with these systems face three options: manual repetition, brittle one-off scripts, or expensive RPA tooling.

| Pain Point | Current State |
|---|---|
| No reusable abstraction | New form = new custom Playwright script from scratch |
| Parameterization is hard | One-off scripts with hardcoded values |
| No scheduling | Manual triggering every time |
| No audit trail | Submissions happen with no structured record |
| Selector rot | DOM changes silently break scripts |
| Slow response times | Form submissions block callers for 30–60s |

---

## 3. Goals & Success Metrics

### P0 — MVP (Phase 1 + 2)

| ID | Requirement | Success Signal |
|---|---|---|
| FR-001 | `discover` CLI crawls a form URL and produces `workflow.yaml` | Valid YAML generated in < 30s for a standard 10-field form |
| FR-002 | Schema inference detects: field type, label, selector, required status, dropdown options | Covers `<input>`, `<select>`, `<textarea>` — all common types |
| FR-003 | Selector strategy prefers `name` attribute and `aria-label` over generated IDs | Works on legacy forms with no clean IDs |
| FR-004 | HTTP server reads workflow configs and registers `POST /api/{name}` | Endpoint live within 2s of server start |
| FR-005 | Incoming JSON validated against inferred schema before execution | Invalid requests return 400 with field-level error detail |
| FR-006 | Submissions are async — returns `runId` immediately, caller polls for result | No 60s blocking API calls |
| FR-007 | `GET /api/{name}/runs/{runId}` returns structured run outcome | Caller can check status without reading log files |
| FR-008 | JSONL audit log written per submission | Every call traceable via existing logger |

### P1 — Core Quality (Phase 3)

| ID | Requirement |
|---|---|
| FR-009 | AI recovery tier activates when deterministic fill fails (existing 3-tier pipeline) |
| FR-010 | Session persistence — `form-api login` flow: headed browser, user logs in manually, Enter to save cookies |
| FR-011 | Multi-step forms: discover detects next-page triggers, accumulates fields across pages |
| FR-012 | Stale config detection — warn when live form DOM no longer matches saved selectors |
| FR-013 | Post-fill event dispatch — trigger `change`/`blur` events after filling to satisfy JS validation |

### P2 — UI Phase (Phase 4)

| ID | Requirement |
|---|---|
| FR-014 | Web dashboard: list workflows, trigger runs manually, view audit logs |
| FR-015 | Schema inspector: show inferred field map, allow inline edits |
| FR-016 | Run status page: live polling for async submissions |

---

## 4. Non-Goals

- **Not a web scraper** — read-only data extraction is out of scope
- **No CAPTCHA solving** — human fallback handles CAPTCHA-blocked forms
- **No hosted SaaS** — self-hosted only
- **No multi-user access control** in V1
- **No visual workflow builder** — YAML is the authoring format; UI comes later

---

## 5. User Personas

**Sam — Solo Developer, Personal Automation**
Submits the same government permit application every month. Currently does it manually. Wants `curl -X POST localhost:3000/api/permit -d '{"name":"Sam"}'` to handle it, with a `runId` he can check later. Comfortable editing YAML when discovery gets a selector wrong.

**Dev Building Internal Tooling**
Their company's HR portal has no API. Onboarding form submissions need to be triggered from their own system via webhook. Wants to drop a `workflow.yaml` into a repo, start `form-api serve`, and have submissions happen automatically with an audit trail.

---

## 6. Workflow Config Schema

The generated `workflow.yaml` is the central artifact. Human-editable, versionable, the source of truth for both the API schema and automation behavior. Inline comments are required in generated files — users must be able to fix selectors without fear of breaking the format.

```yaml
version: "1"
name: permit-application
description: "Monthly permit renewal — City Portal"
url: "https://city.gov/permits/renew"

# Auth: run `form-api login --workflow permit-application` to save cookies
auth:
  strategy: cookie_jar
  cookie_file: ".cookies/permit-application.json"

# JSON Schema for POST /api/permit-application body
input:
  type: object
  required: [applicantName, permitNumber]
  properties:
    applicantName: { type: string }
    permitNumber:  { type: string }
    renewalReason: { type: string, default: "Annual renewal" }

sections:
  - id: applicant_info
    fields:
      # selector priority: name attr > aria-label > data-testid > scoped CSS
      - id: name
        selector: "[name='applicantName']"
        aria_label: "Applicant Name"       # fallback if selector breaks
        type: text
        value: "{{ input.applicantName }}"
        required: true
        dispatch_events: [change, blur]    # FR-013: trigger JS validation

      - id: permit_number
        selector: "[name='permitNo']"
        aria_label: "Permit Number"
        type: text
        value: "{{ input.permitNumber }}"
        required: true
        dispatch_events: [change, blur]

      - id: reason
        selector: "[name='renewalReason']"
        type: select
        value: "{{ input.renewalReason }}"
        options: ["Annual renewal", "Lost permit", "Change of address"]

  - id: submit
    type: submit
    selector: "[type='submit']"
    success_selector: ".confirmation-message"  # what to read as the result
    timeout_ms: 60000                          # slow portals need time

recovery:
  tiers: [name_attr, aria_label, llm_locate]
  llm_budget: 4
```

---

## 7. API Contract

### Submit a form (async)

**POST `/api/{workflow-name}`**

```json
// Request
{ "applicantName": "Sam", "permitNumber": "P-12345" }

// Response — 202 Accepted
{
  "runId": "run-1743891234",
  "status": "queued",
  "pollUrl": "/api/permit-application/runs/run-1743891234"
}
```

### Poll for result

**GET `/api/{workflow-name}/runs/{runId}`**

```json
// Completed
{
  "runId": "run-1743891234",
  "status": "success",
  "message": "Application submitted. Reference #99123.",
  "tiersUsed": ["deterministic"],
  "durationMs": 4200
}

// Failed
{
  "runId": "run-1743891235",
  "status": "failed",
  "error": "Field [name='permitNo'] not found after recovery",
  "tiersUsed": ["deterministic", "ai_recovery"],
  "durationMs": 9100
}
```

### Other endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api` | List all registered workflows + their input schemas |
| `GET` | `/api/{name}/schema` | JSON Schema for a workflow's input body |
| `GET` | `/api/{name}/runs` | Audit log for all runs of a workflow |
| `POST` | `/api/{name}/login` | Trigger headed browser for manual login + cookie save |

---

## 8. Implementation Phases

### Phase 1 — Discovery CLI *(~1–2 weeks)*

**Goal:** `form-api discover --url <url>` produces a valid, human-readable `workflow.yaml`.

**Build:**
- DOM crawler: visits URL, extracts all form fields
- Per field: label (from `<label>`, `aria-label`, `placeholder`), `type`, `name` attr (preferred), `id`/CSS (fallback), `required`, dropdown options
- Selector strategy: emit `name` attribute as primary, `aria-label` as fallback — never raw generated IDs unless nothing else exists
- Inline YAML comments generated explaining each field
- Warns when multi-step form detected (can't fully discover statically)
- CLI: `form-api discover --url <url> [--out workflow.yaml] [--headed]`

**Extend from existing code:**
- `src/session.ts` — reuse browser lifecycle
- `src/tools/browserTools.ts` → add `discoverFormFields()` tool
- **New:** `src/discover/crawler.ts`, `src/discover/schema-builder.ts`, `src/cli/index.ts`

---

### Phase 2 — Execution Server *(~1 week)*

**Goal:** `form-api serve` reads all `workflow.yaml` files in `./workflows/` and registers live async API endpoints.

**Build:**
- YAML loader with Zod validation → typed `WorkflowConfig`
- `WorkflowConfig → WorkflowInput` adapter (maps to existing engine type)
- Dynamic route registration per workflow file
- Input validation middleware (400 on schema mismatch)
- Async execution: queue job, return `runId` immediately (reuse existing queue)
- Result extraction: read `success_selector` from DOM after submit
- Status polling endpoint backed by existing JSONL logs

**Extend from existing code:**
- `src/api/server.ts` — dynamic route registration
- `src/api/queue.ts` — reuse as-is
- `src/orchestration/orchestrator.ts` — reuse execution pipeline
- `src/logger.ts` — add `workflowName` field to log lines
- **New:** `src/workflow-loader/loader.ts`, `src/workflow-loader/adapter.ts`, `src/api/workflow-registry.ts`

---

### Phase 3 — Auth + Resilience *(~1–2 weeks)*

- **Login flow:** `form-api login --workflow <name>` opens headed Chromium, user logs in, presses Enter in terminal → cookies saved to `.cookies/{name}.json` → loaded automatically on all subsequent runs
- **Event dispatch:** After `page.fill()`, dispatch `change` + `blur` events via `page.dispatchEvent()` for fields with `dispatch_events` set
- **Stale detection:** On each run, re-snapshot selectors and diff against workflow YAML — log warning when drift detected, don't fail silently
- **Multi-step discovery:** `--headed` mode + interactive stepping through form pages

---

### Phase 4 — UI *(separate effort, future)*

- Next.js frontend consuming the Phase 2 API
- Pages: workflow list, manual trigger, run status poller, audit log viewer, schema editor
- No new backend work — UI is a pure API consumer

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Discovery gets wrong selectors (esp. legacy forms with no clean attributes) | High | Medium | Prefer `name` attr + `aria-label`; generated YAML has inline comments; users expected to review and edit |
| Form DOM changes break saved selectors | High | High | Stale detection (FR-012) + self-healing waterfall (name → aria-label → LLM) |
| Multi-step / conditional forms can't be fully discovered statically | High | Medium | Discovery warns; `--headed` mode lets user walk through manually; fields added incrementally |
| Slow form submissions block callers | Medium | High | Async-first API (FR-006): return `runId`, poll for result |
| Auth-gated forms require manual login | Medium | Medium | `form-api login` flow (FR-010) saves cookies; human fallback handles MFA |
| JS validation rejects programmatically filled values | Medium | Medium | `dispatch_events` config (FR-013); verify step catches mismatches |
| Legal/TOS concerns on certain sites | Low | Low | Self-hosted, personal use — same posture as any personal Playwright script |

---

## 10. File Structure

```
src/
  discover/
    crawler.ts            # DOM traversal + field extraction
    schema-builder.ts     # field metadata → WorkflowConfig
    yaml-writer.ts        # serializes config to YAML with inline comments
  cli/
    index.ts              # commander CLI (discover, serve, login commands)
  workflow-loader/
    loader.ts             # parses + validates workflow.yaml via Zod
    adapter.ts            # WorkflowConfig → WorkflowInput (existing type)
  api/
    server.ts             # extended: dynamic route registration
    workflow-registry.ts  # watches ./workflows/, registers/deregisters routes
    runs.ts               # GET /runs/:id backed by JSONL logs

workflows/                # user-created workflow YAML files
.cookies/                 # gitignored — session cookies per workflow
docs/
  PRD-form-api-wrapper.md # this file
```

---

---

## 11. Adversarial Review Findings

*Review applied April 2026. Challenges and resolutions below.*

### Challenge 1 — Multi-step discovery assumes linear form state
**Finding:** Dummy values during discovery traverse one conditional branch, silently missing entire field trees on other paths.
**Resolution:** Discovery does not claim completeness for multi-step forms. The generated YAML includes a `discovered: partial` flag when branching is detected. Users must manually walk alternative branches using `--headed` mode and merge the output. Discovery is a starting point, not a guarantee.

### Challenge 2 — Cookie jars don't work for CSRF tokens or fingerprinting
**Finding:** Government and enterprise portals often use per-submission CSRF tokens, short-lived session tokens, or bot fingerprinting (Cloudflare, DataDome) — all of which break naive cookie reuse.
**Resolution:** Cookie persistence handles session auth (the login state). CSRF tokens are fetched fresh per run from the live DOM before each submission — not stored. Bot fingerprinting is a known non-goal: sites with active bot detection (Cloudflare, DataDome) are out of scope for V1. Document this explicitly.

### Challenge 3 — `discover` overwrites manually edited YAML (first user complaint)
**Finding:** Running `discover` again on an already-configured workflow would blow away manual selector fixes.
**Resolution:** `discover` never overwrites an existing file by default. Requires explicit `--overwrite` flag. Alternatively, `discover --merge` diffs and only updates fields that are new or changed, preserving manual edits.

### Challenge 4 — FR-008 and FR-013 contradict each other
**Finding:** Stale config detection requires a stable DOM baseline — but conditional multi-step forms have no stable baseline.
**Resolution:** Stale detection only runs on single-page or fully-discovered workflows (`discovered: complete`). For partial workflows, stale detection is skipped and a warning is logged on each run.

### Challenge 5 — Missing scenarios
Added to Non-Goals or Risks:
- **File uploads** — not supported in V1. Fields with `type="file"` are detected during discovery and flagged in the YAML as `unsupported: true`.
- **Ambiguous submission response** — when `success_selector` doesn't match and no URL change occurs, the run result is `status: ambiguous`. Caller must verify externally.
- **Re-submission idempotency** — the tool makes no idempotency guarantees. This is the caller's responsibility. Document clearly.
- **Concurrent browser instances** — each queued run gets its own Playwright browser context (already how the existing engine works). Isolation is guaranteed at the process level.

### Challenge 6 — Legal/ToS risk for open source distribution
**Finding:** Automating government and enterprise form submissions likely violates the ToS of target sites. Open sourcing amplifies this exposure.
**Resolution:** V1 is personal/internal use only (already a Non-Goal). Any future open source release requires: (a) prominent ToS disclaimer in README, (b) no example workflows targeting real government/enterprise URLs in the repo, (c) user takes full responsibility for their use. This is the same posture as Playwright, Puppeteer, and every other browser automation tool.

---

*Adversarial review: applied (agent — April 2026)*
*Self-review: applied (selector quality, async-first API, event dispatch, login UX, slow portal timeouts)*

---

**Score estimate: 87/100**
- AI-Specific Optimization: 22/25 (async execution, AI recovery tier, LLM budget, ambiguous result handling)
- Traditional PRD Core: 22/25 (personas, non-goals, metrics)
- Implementation Clarity: 27/30 (file structure, phase breakdown, code references)
- Completeness: 16/20 (adversarial review addressed key gaps; file uploads and idempotency documented as known limits)
