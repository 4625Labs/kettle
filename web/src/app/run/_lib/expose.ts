// A host watcher on the app VM writes these into agent_runs.options as an
// N4 per-run NetBird `expose` link comes up and goes down. Nothing else in
// this app writes these keys.
export interface RunOptions {
  expose_url?: string;
  expose_pin?: string;
  expose_started_at?: string;
  expose_ended_at?: string;
}

export function parseRunOptions(value: unknown): RunOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const obj = value as Record<string, unknown>;
  const str = (k: string) => (typeof obj[k] === "string" ? (obj[k] as string) : undefined);
  return {
    expose_url: str("expose_url"),
    expose_pin: str("expose_pin"),
    expose_started_at: str("expose_started_at"),
    expose_ended_at: str("expose_ended_at"),
  };
}
