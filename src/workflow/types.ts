/**
 * Shared types for the medical form workflow.
 * Imported by agent files, the orchestrator, and main.ts.
 */

export type WorkflowInput = {
  // Section 1 — Personal Information (required)
  firstName: string;
  lastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  medicalId: string;
  // Section 2 — Medical Information (optional, skipped if not provided)
  gender?: string;    // visible label text e.g. Male
  bloodType?: string; // visible label text e.g. O+
  allergies?: string;
  medications?: string;
  // Section 3 — Emergency Contact (optional, skipped if not provided)
  emergencyContact?: string;
  emergencyPhone?: string;
};

/**
 * Returned by every section checkpoint.
 * `valid` is true only when every provided field matches the expected value.
 * `failingFields` carries human-readable descriptions (e.g. `#gender (expected "Male", got "")`)
 * that are injected as a hint into the AI sub-agent when recovery is needed.
 */
export type CheckResult = {
  valid: boolean;
  failingFields: string[];
};
