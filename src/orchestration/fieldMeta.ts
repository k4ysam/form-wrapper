/** Human-readable labels for internal section keys. */
export const SECTION_LABELS: Record<string, string> = {
  personalInfo:     "Personal Information",
  medicalInfo:      "Medical Information",
  emergencyContact: "Emergency Contact",
  submit:           "Form Submission",
};

/** Human-readable labels for CSS selectors shown in failing-field entries. */
export const FIELD_LABELS: Record<string, string> = {
  "#firstName":        "First Name",
  "#lastName":         "Last Name",
  "#dateOfBirth":      "Date of Birth",
  "#medicalId":        "Medical ID",
  "#gender":           "Gender",
  "#bloodType":        "Blood Type",
  "#allergies":        "Allergies",
  "#medications":      "Current Medications",
  "#emergencyContact": "Emergency Contact Name",
  "#emergencyPhone":   "Emergency Contact Phone",
};

/** Format hints shown when a field has a specific constraint that is easy to get wrong. */
export const FIELD_HINTS: Record<string, string> = {
  "#dateOfBirth": "Format must be YYYY-MM-DD (e.g. 1990-01-15). Do NOT use DD/MM/YYYY.",
  "#gender":      "Must exactly match a dropdown option: Male | Female | Other | Prefer not to say",
  "#bloodType":   "Must exactly match a dropdown option: A+ | A- | B+ | B- | AB+ | AB- | O+ | O-",
};

/**
 * Parses a failingFields entry of the form:
 *   "#selector (expected "X", got "Y")"
 * Returns { selector, expected, actual } or null if the format doesn't match.
 */
export function parseFailingField(
  entry: string
): { selector: string; expected: string; actual: string } | null {
  const match = entry.match(/^(#\S+)\s+\(expected "([^"]*)", got "([^"]*)"\)$/);
  if (!match) return null;
  return { selector: match[1], expected: match[2], actual: match[3] };
}

/** Derive a short label for the first failing field (e.g. "Date of Birth", "Gender"). */
export function getErrorHint(failingFields: string[]): string | undefined {
  const first = failingFields[0];
  if (!first) return undefined;
  const parsed = parseFailingField(first);
  return parsed ? (FIELD_LABELS[parsed.selector] ?? parsed.selector) : undefined;
}
