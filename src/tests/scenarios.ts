/**
 * Test scenarios for the medical form workflow.
 *
 * IMPORTANT: The `note` field is for human-readable documentation only.
 * It is logged by runner.ts to the console but is NEVER passed to any
 * deterministic step, AI agent, or LLM prompt.
 *
 * Happy-path (TC-01 to TC-05):
 *   Deterministic engine handles all of these with 0 LLM calls.
 *   runner.ts executes them directly.
 *
 * AI-recovery (TC-06 to TC-08):
 *   Deliberately messy inputs that force the checkpoint to fail and
 *   invoke the AI sub-agent. runner.ts enqueues these for `npm run cron`.
 *   Budget cost: ~2 LLM calls per scenario (one per failing section).
 */

import { WorkflowInput } from "../workflow/types";

export type Scenario = {
  id: string;
  name: string;
  /** Human-readable explanation — logged to console only, never fed to any agent. */
  note: string;
  input: Partial<WorkflowInput>;
};

// ---------------------------------------------------------------------------
// Happy-path scenarios — 0 LLM calls expected
// ---------------------------------------------------------------------------

export const happyPathScenarios: Scenario[] = [
  {
    id: "TC-01",
    name: "Full valid run — all sections",
    note: "All 3 sections with valid, well-formatted data. All pass deterministically.",
    input: {
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1990-01-15",
      medicalId: "91927885",
      gender: "Male",
      bloodType: "O+",
      allergies: "Walnuts",
      medications: "Sleeping Pills",
      emergencyContact: "Jane Doe",
      emergencyPhone: "444-555-6666",
    },
  },
  {
    id: "TC-02",
    name: "Section 1 only — no optional fields",
    note: "Sections 2 & 3 skipped entirely. Tests the skip path.",
    input: {
      firstName: "Sam",
      lastName: "Jones",
      dateOfBirth: "1995-05-05",
      medicalId: "77665544",
    },
  },
  {
    id: "TC-03",
    name: "Section 1 + 2 — no emergency contact",
    note: "Section 3 skipped. Tests two-section run.",
    input: {
      firstName: "Alice",
      lastName: "Chen",
      dateOfBirth: "2000-03-10",
      medicalId: "99887766",
      gender: "Female",
      bloodType: "B-",
      allergies: "None",
      medications: "Aspirin",
    },
  },
  {
    id: "TC-04",
    name: "Case-insensitive deterministic resolution",
    note: "Gender 'FEMALE' and bloodType 'o+' are caught by case-insensitive matching " +
          "in makeSelectStep — no AI call needed. Validates the deterministic-tier fix.",
    input: {
      firstName: "Casey",
      lastName: "CaseTest",
      dateOfBirth: "1988-07-19",
      medicalId: "55443321",
      gender: "FEMALE",   // resolved deterministically via case-insensitive match
      bloodType: "o+",    // resolved deterministically via case-insensitive match
      allergies: "None",
      medications: "None",
    },
  },
  {
    id: "TC-05",
    name: "Incomplete emergency contact pair — skipped cleanly",
    note: "Only emergencyPhone provided. Orchestrator skips Section 3 with a warning " +
          "rather than filling one field and letting the other block form submission.",
    input: {
      firstName: "River",
      lastName: "HalfContact",
      dateOfBirth: "2001-04-20",
      medicalId: "44332211",
      emergencyPhone: "555-123-4567", // no emergencyContact — pair intentionally broken
    },
  },
];

// ---------------------------------------------------------------------------
// AI-recovery scenarios — deterministic will fail, AI sub-agent is invoked.
// Budget: ~2 LLM calls per run. Run via `npm run cron` after enqueuing.
// ---------------------------------------------------------------------------

export const aiRecoveryScenarios: Scenario[] = [
  {
    id: "TC-06",
    name: "Natural-language DOB + full-form blood type",
    note: "Section 1: DOB 'March 3rd, 1992' is rejected by <input type=date> — AI must " +
          "parse the natural-language date and fill YYYY-MM-DD format. " +
          "Section 2: bloodType 'B negative' has no dropdown match — AI must map to 'B-'. " +
          "Gender 'FEMALE' is resolved deterministically (no AI cost). " +
          "Demonstrates AI handling natural-language input across two sections (2 LLM calls).",
    input: {
      firstName: "Jamie",
      lastName: "NaturalInputs",
      dateOfBirth: "March 3rd, 1992",     // natural language — AI converts to 1992-03-03
      medicalId: "10203040",
      gender: "FEMALE",                    // deterministic case-insensitive match
      bloodType: "B negative",             // AI maps to B-
      allergies: "Tree nuts",
      medications: "Loratadine",
      emergencyContact: "Drew Natural",
      emergencyPhone: "222-333-4444",
    },
  },
  {
    id: "TC-07",
    name: "Gender typo + ambiguous blood type",
    note: "Section 2: gender 'Femal' (one char short of Female) — AI must infer closest " +
          "option. bloodType 'AB' is ambiguous (AB+ vs AB-) — AI must pick one. " +
          "DOB is valid so Section 1 passes deterministically. " +
          "Tests single-section AI recovery with two unresolvable dropdown values (1 LLM call).",
    input: {
      firstName: "Morgan",
      lastName: "TyposAll",
      dateOfBirth: "1985-11-09",
      medicalId: "50607080",
      gender: "Femal",                     // one-char typo — AI infers Female
      bloodType: "AB",                     // ambiguous — AI picks AB+ or AB-
      allergies: "Pollen",
      medications: "Antihistamine",
    },
  },
  {
    id: "TC-08",
    name: "European DOB + abbreviated gender + long-form blood type (maximum AI challenge)",
    note: "Section 1: DOB '29/02/1988' — DD/MM/YYYY rejected by date input AND is a " +
          "leap-year date (must be preserved correctly as 1988-02-29). " +
          "Section 2: gender 'F' (single letter abbreviation) — AI infers Female. " +
          "bloodType 'O positive' — written-out Rh group, AI maps to O+. " +
          "Section 3: valid emergency pair — deterministic. " +
          "Exercises all three sections and both AI slots (2 LLM calls).",
    input: {
      firstName: "Alex",
      lastName: "MaxEdge",
      dateOfBirth: "29/02/1988",           // leap-year date in European format
      medicalId: "90807060",
      gender: "F",                          // single-letter abbreviation — AI infers Female
      bloodType: "O positive",             // long-form — AI maps to O+
      allergies: "Seafood",
      medications: "None",
      emergencyContact: "Taylor Edge",
      emergencyPhone: "999-888-7777",
    },
  },
];

export const allScenarios: Scenario[] = [...happyPathScenarios, ...aiRecoveryScenarios];
