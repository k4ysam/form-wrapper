import { runOrchestrator } from "./orchestration";
import { createSession } from "./session";
import { WorkflowInput } from "./workflow";

/**
 * Default SOP values. These can be overridden via the POST /run API endpoint
 * or swapped out when invoking main() directly 
 */
export const DEFAULT_INPUT: WorkflowInput = {
  // Section 1 — Personal Information
  firstName: "John",
  lastName: "Doe",
  dateOfBirth: "1990-01-01",
  medicalId: "91927885",
  // Section 2 — Medical Information
  gender: "Male",
  bloodType: "O+",
  allergies: "Peanuts",
  medications: "Aspirin",
  // Section 3 — Emergency Contact
  emergencyContact: "Jane Doe",
  emergencyPhone: "444-555-6666",
};

// This will automatically create a chromium instance, connect, and navigate to the given url.
// You are given a playwright page back.
// Required fields (Section 1) fall back to DEFAULT_INPUT when not provided.
// Optional fields (Sections 2 & 3) are taken ONLY from overrides — undefined means skip the section.
// This prevents queue items that only supply Section 1 data from accidentally inheriting
// DEFAULT_INPUT values for gender, bloodType, etc.
export async function main(
  overrides: Partial<WorkflowInput> = {},
  { keepOpen = false }: { keepOpen?: boolean } = {}
): Promise<string> {
  const input: WorkflowInput = {
    // Required — always fall back to DEFAULT_INPUT
    firstName:   overrides.firstName   ?? DEFAULT_INPUT.firstName,
    lastName:    overrides.lastName    ?? DEFAULT_INPUT.lastName,
    dateOfBirth: overrides.dateOfBirth ?? DEFAULT_INPUT.dateOfBirth,
    medicalId:   overrides.medicalId   ?? DEFAULT_INPUT.medicalId,
    // Optional — undefined means skip the section entirely
    gender:           overrides.gender,
    bloodType:        overrides.bloodType,
    allergies:        overrides.allergies,
    medications:      overrides.medications,
    emergencyContact: overrides.emergencyContact,
    emergencyPhone:   overrides.emergencyPhone,
  };
  const formUrl = process.env.FORM_URL;
  if (!formUrl) throw new Error("FORM_URL is not set");
  const { page, context } = await createSession(formUrl, { headed: true });
  const summary = await runOrchestrator(page, input);
  const browser = context.browser();
  if (keepOpen && browser) {
    console.log(`\n[run] Summary: ${summary}`);
    console.log(`[run] Browser open for review — close the window to exit.`);
    await new Promise<void>((resolve) => browser.on("disconnected", () => resolve()));
  } else {
    await browser?.close();
  }
  return summary;
}
