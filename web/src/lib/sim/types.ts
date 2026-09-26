import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobKind, JobPayload } from "@/lib/contracts";

export interface SimJob<K extends JobKind = JobKind> {
  id: string;
  kind: K;
  payload: JobPayload<K>;
}

export interface SimDeps {
  supabase: SupabaseClient;
  enqueue: <K extends JobKind>(kind: K, payload: JobPayload<K>) => Promise<void>;
}

export type SimJobHandler<K extends JobKind = JobKind> = (job: SimJob<K>, deps: SimDeps) => Promise<void>;

// A mapped type (not `Record<JobKind, SimJobHandler>`) so each entry keeps its own payload type —
// a plain Record would make every handler's `job.payload` the union of all job kinds' payloads.
export type SimHandlerMap = { [K in JobKind]?: SimJobHandler<K> };
