/** Thrown when an agent cannot resolve something and a human must step in (K6). Never retried. */
export class EscalationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscalationError";
  }
}
