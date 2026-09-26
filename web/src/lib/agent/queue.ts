import {
  jobInsertSchema,
  parseJobPayload,
  type JobKind,
  type JobPayload,
} from "@/lib/contracts";
import { must, serviceDb } from "./db";

export interface JobRow {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

/** Validates the payload against its contract and inserts a queued job. */
export async function enqueue<K extends JobKind>(
  kind: K,
  payload: JobPayload<K>,
  opts: { delayMs?: number; maxAttempts?: number } = {},
) {
  const parsed = parseJobPayload(kind, payload);
  const row = jobInsertSchema.parse({
    kind,
    payload: parsed,
    run_after: opts.delayMs ? new Date(Date.now() + opts.delayMs).toISOString() : undefined,
    max_attempts: opts.maxAttempts,
  });
  return must(
    await serviceDb()
      .from("jobs")
      .insert({ ...row, payload: row.payload as never })
      .select("id")
      .single(),
    `enqueue ${kind}`,
  );
}

/** Loosely-typed enqueue handed to Sim-world handlers (they validate against the same contracts). */
export async function enqueueUnknown(kind: JobKind, payload: unknown) {
  return enqueue(kind, parseJobPayload(kind, payload));
}
