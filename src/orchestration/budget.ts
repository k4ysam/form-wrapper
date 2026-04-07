/**
 * Tracks how many LLM calls have been made this run.
 * If the budget is exhausted, the orchestrator skips AI recovery and goes
 * straight to human-in-the-loop, avoiding further rate-limit errors.
 */
export class RunBudget {
  private used = 0;
  constructor(private readonly max: number) {}
  available(): boolean { return this.used < this.max; }
  consume(): void { this.used++; }
  get status(): string { return `${this.used}/${this.max} LLM calls used`; }
}
