// Kettle agent worker loop: claims jobs from the Postgres queue (claim_job), dispatches them by kind,
// retries with exponential backoff, renews its lease while a job runs, requeues jobs whose worker
// died, and drains in-flight work on shutdown.
import { ZodError } from "zod";
import { serviceDb } from "@/lib/agent/db";
import { escalate, runJob } from "@/lib/agent/dispatch";
import { EscalationError } from "@/lib/agent/errors";
import type { JobRow } from "@/lib/agent/queue";

export interface WorkerOptions {
  workerId: string;
  concurrency?: number;
  /** Idle poll interval; a busy slot re-polls immediately. */
  pollMs?: number;
  /** A running job whose lease is older than this is presumed dead and requeued. */
  leaseMs?: number;
  log?: (msg: string) => void;
}

export interface WorkerHandle {
  stop: () => Promise<void>;
  stats: { processed: number; failed: number; retried: number; inFlight: number };
}

const MAX_BACKOFF_MS = 30_000;

export function backoffMs(attempts: number): number {
  return Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** Math.max(0, attempts - 1));
}

function retryable(err: unknown): boolean {
  return !(err instanceof EscalationError || err instanceof ZodError);
}

export function startWorker(opts: WorkerOptions): WorkerHandle {
  const db = serviceDb();
  const concurrency = opts.concurrency ?? 4;
  const pollMs = opts.pollMs ?? 300;
  const leaseMs = opts.leaseMs ?? 60_000;
  const log = opts.log ?? ((m: string) => console.log(`[worker ${opts.workerId}] ${m}`));
  const stats = { processed: 0, failed: 0, retried: 0, inFlight: 0 };
  let stopping = false;
  let wake: (() => void) | null = null;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        wake = null;
        resolve();
      }, ms);
      wake = () => {
        clearTimeout(t);
        wake = null;
        resolve();
      };
    });

  async function claim(): Promise<JobRow | null> {
    const { data, error } = await db.rpc("claim_job", { worker_id: opts.workerId });
    if (error) throw new Error(`claim_job: ${error.message}`);
    const row = data as unknown as JobRow | null;
    return row && row.id ? row : null;
  }

  async function execute(job: JobRow) {
    stats.inFlight++;
    const started = Date.now();
    const lease = setInterval(() => {
      void db.from("jobs").update({ locked_at: new Date().toISOString() }).eq("id", job.id).eq("status", "running");
    }, Math.max(1_000, leaseMs / 3));
    try {
      await runJob(job);
      await db.from("jobs").update({ status: "done", last_error: null }).eq("id", job.id);
      stats.processed++;
      log(`done ${job.kind} ${job.id.slice(0, 8)} in ${Date.now() - started} ms`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const final = !retryable(err) || job.attempts >= job.max_attempts;
      if (final) {
        stats.failed++;
        await db.from("jobs").update({ status: "failed", last_error: message.slice(0, 2000) }).eq("id", job.id);
        log(`FAILED ${job.kind} ${job.id.slice(0, 8)} (attempt ${job.attempts}/${job.max_attempts}): ${message}`);
        await escalate(job, err).catch((e) => log(`escalation failed: ${e instanceof Error ? e.message : e}`));
      } else {
        stats.retried++;
        const delay = backoffMs(job.attempts);
        await db
          .from("jobs")
          .update({
            status: "queued",
            run_after: new Date(Date.now() + delay).toISOString(),
            locked_at: null,
            locked_by: null,
            last_error: message.slice(0, 2000),
          })
          .eq("id", job.id);
        log(`retry ${job.kind} ${job.id.slice(0, 8)} in ${delay} ms (attempt ${job.attempts}/${job.max_attempts}): ${message}`);
      }
    } finally {
      clearInterval(lease);
      stats.inFlight--;
    }
  }

  async function slot() {
    while (!stopping) {
      let job: JobRow | null = null;
      try {
        job = await claim();
      } catch (err) {
        log(err instanceof Error ? err.message : String(err));
      }
      if (job) await execute(job);
      else await sleep(pollMs);
    }
  }

  // Requeue jobs whose worker stopped renewing the lease (crash, kill -9, deploy).
  async function reap() {
    const cutoff = new Date(Date.now() - leaseMs).toISOString();
    const { data } = await db
      .from("jobs")
      .update({ status: "queued", locked_at: null, locked_by: null, last_error: "lease expired; requeued" })
      .eq("status", "running")
      .lt("locked_at", cutoff)
      .select("id, kind");
    for (const j of data ?? []) log(`requeued stale ${j.kind} ${j.id.slice(0, 8)}`);
  }

  const reaper = setInterval(() => void reap().catch(() => undefined), Math.max(5_000, leaseMs / 2));
  const heartbeat = setInterval(
    () => log(`heartbeat: processed=${stats.processed} failed=${stats.failed} retried=${stats.retried} in_flight=${stats.inFlight}`),
    30_000,
  );
  void reap().catch(() => undefined);
  const slots = Array.from({ length: concurrency }, () => slot());
  log(`started with concurrency ${concurrency}`);

  return {
    stats,
    stop: async () => {
      stopping = true;
      clearInterval(reaper);
      clearInterval(heartbeat);
      wake?.();
      await Promise.all(slots);
      log("stopped");
    },
  };
}
