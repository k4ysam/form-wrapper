/** Outcome of one section for run summary. */
export type SectionOutcome = {
  section: string;
  sectionLabel: string;
  resolution: "deterministic" | "ai" | "human" | "skipped";
  errorHint?: string;
  /** All field names that failed the checkpoint (empty when deterministic pass). */
  failingFields?: string[];
};

/** The result returned by every sub-agent when it completes. */
export type HandoffContext = {
  success: boolean;
  section: string;
  skipped?: boolean;
  error?: string;
};
