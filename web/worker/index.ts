// Worker entrypoint. Built to worker/dist/index.js (npm run worker:build); dev: npm run worker:dev.
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VULTR_INFERENCE_API_KEY,
// optional WORKER_CONCURRENCY, WORKER_ID, VULTR_AGENT_MODEL.
import { hostname } from "node:os";
import { startWorker } from "./loop";

const worker = startWorker({
  workerId: process.env.WORKER_ID ?? `${hostname()}-${process.pid}`,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 4),
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal}: draining in-flight jobs...`);
  const force = setTimeout(() => {
    console.error("[worker] drain timed out; exiting (unfinished jobs will be requeued by lease expiry)");
    process.exit(1);
  }, 45_000);
  await worker.stop();
  clearTimeout(force);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => console.error("[worker] unhandled rejection", err));
