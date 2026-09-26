// Golden-path eval (§6 incl. the anomaly pushback): runs the full scenario N times against the local
// Supabase + Vultr inference with an in-process worker, auto-approving gates as a human would.
//   npm run eval                # 5 runs
//   npm run eval -- 1 --keep    # 1 run, keep its data for inspection
//   npm run eval -- --cleanup   # delete every leftover [eval] deal and its run data
// Each run creates its own won deal (no reset_demo, so shared local data is untouched) and asserts
// only on its own run_id. Passing runs are cleaned up; failing runs are kept for debugging.
import { serviceDb } from "../src/lib/agent/db";
import { enqueue } from "../src/lib/agent/queue";
import { startWorker } from "../worker/loop";

const ACME = "00000000-0000-0000-0000-000000000001";
const LAPTOP = "20000000-0000-0000-0000-000000000001";
const OPS_USER = "40000000-0000-0000-0000-000000000001";
const RUN_BUDGET_MS = 60_000;
const HARD_TIMEOUT_MS = 120_000;

const db = serviceDb();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RunReport {
  run: number;
  runId: string | null;
  pass: boolean;
  seconds: number;
  steps: number;
  llmCalls: number;
  fallbacks: number;
  tokens: number;
  failures: string[];
}

async function createDeal(i: number) {
  const { data: deal, error } = await db
    .from("deals")
    .insert({ company_id: ACME, title: `[eval] Q4 hardware refresh - 200 units #${i}`, stage: "won", value: 48000, closed_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  const { error: e2 } = await db.from("deal_line_items").insert({ deal_id: deal.id, product_id: LAPTOP, quantity: 200, unit_price: 240 });
  if (e2) throw e2;
  return deal.id;
}

async function waitForRun(jobId: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const { data } = await db.from("agent_runs").select("id").contains("options", { job_id: jobId }).maybeSingle();
    if (data) return data.id;
    await sleep(200);
  }
  throw new Error("run was never created");
}

async function autoApprove(runId: string) {
  const { data } = await db.from("approvals").select("id, subject_type").eq("run_id", runId).eq("status", "pending");
  for (const a of data ?? []) {
    await db
      .from("approvals")
      .update({ status: "approved", decided_by: OPS_USER, decided_at: new Date().toISOString(), note: "eval auto-approve" })
      .eq("id", a.id)
      .eq("status", "pending");
  }
}

async function check(runId: string, dealId: string, ms: number): Promise<Pick<RunReport, "failures" | "steps" | "llmCalls" | "fallbacks" | "tokens">> {
  const f: string[] = [];
  const expect = (ok: unknown, msg: string) => {
    if (!ok) f.push(msg);
  };

  const { data: run } = await db.from("agent_runs").select("status").eq("id", runId).single();
  expect(run?.status === "completed", `run status is ${run?.status}`);
  expect(ms < RUN_BUDGET_MS, `took ${(ms / 1000).toFixed(1)} s (budget ${RUN_BUDGET_MS / 1000} s)`);

  const { data: pr } = await db.from("purchase_requests").select("id, status").eq("deal_id", dealId).maybeSingle();
  expect(pr?.status === "awarded", `purchase request status ${pr?.status}`);
  const { data: quotes } = await db.from("vendor_quotes").select("status, unit_price").eq("purchase_request_id", pr?.id ?? "");
  expect((quotes ?? []).length >= 3, `${quotes?.length ?? 0} quotes`);
  const selected = (quotes ?? []).filter((q) => q.status === "selected");
  expect(selected.length === 1, `${selected.length} selected quotes`);

  const { data: po } = await db.from("purchase_orders").select("id, status").eq("purchase_request_id", pr?.id ?? "").maybeSingle();
  expect(po?.status === "issued", `PO status ${po?.status}`);
  const { data: gr } = await db.from("goods_receipts").select("id").eq("purchase_order_id", po?.id ?? "");
  expect((gr ?? []).length === 1, "goods receipt missing");

  const { data: payables } = await db.from("invoices").select("id, status, unit_price").eq("purchase_order_id", po?.id ?? "").eq("direction", "payable");
  expect((payables ?? []).length === 1, `${payables?.length ?? 0} payable invoices`);
  const payable = payables?.[0];
  expect(payable?.status === "paid", `payable status ${payable?.status}`);
  expect(selected[0] && Number(payable?.unit_price) === Number(selected[0].unit_price), `payable unit price ${payable?.unit_price} vs quote ${selected[0]?.unit_price}`);
  const { data: pays } = await db.from("payments").select("status").eq("invoice_id", payable?.id ?? "");
  expect((pays ?? []).some((p) => p.status === "sent"), "vendor payment not sent");

  const { data: recv } = await db.from("invoices").select("status").eq("deal_id", dealId).eq("direction", "receivable").maybeSingle();
  expect(recv?.status === "paid", `receivable status ${recv?.status}`);

  const { data: handoffs } = await db.from("handoffs").select("type, status").eq("run_id", runId);
  for (const t of ["purchase_request.create", "customer_invoice.create", "vendor_invoice.expect", "invoice.anomaly", "invoice.corrected", "payment.status"]) {
    const hs = (handoffs ?? []).filter((h) => h.type === t);
    expect(hs.length >= 1, `no ${t} handoff`);
    expect(hs.every((h) => h.status === "done"), `${t} handoff not done (${hs.map((h) => h.status).join(",")})`);
  }

  const { data: steps } = await db.from("agent_steps").select("agent, action, status, model, latency_ms, tokens_in, tokens_out, output").eq("run_id", runId);
  const s = steps ?? [];
  expect(s.every((x) => x.agent), "a step has no agent");
  const matches = s.filter((x) => x.action === "invoice.match");
  expect(matches.some((x) => x.status === "flagged"), "anomaly was never flagged by the 3-way match");
  expect(matches.some((x) => x.status === "ok"), "invoice never re-matched cleanly");
  expect(s.some((x) => x.action === "invoice.dispute"), "procurement never disputed the invoice");
  expect(!s.some((x) => x.status === "error"), `error steps: ${s.filter((x) => x.status === "error").map((x) => x.action).join(",")}`);
  const llm = s.filter((x) => x.model && x.model !== "stub-extractor");
  expect(llm.every((x) => typeof x.latency_ms === "number"), "an LLM step has no latency");
  for (const agent of ["orchestrator", "sales", "procurement", "finance"]) {
    expect(s.some((x) => x.agent === agent), `no ${agent} steps`);
  }
  const fallbacks = s.filter((x) => (x.output as Record<string, unknown> | null)?.fallback).length;

  return {
    failures: f,
    steps: s.length,
    llmCalls: llm.length,
    fallbacks,
    tokens: llm.reduce((t, x) => t + (x.tokens_in ?? 0) + (x.tokens_out ?? 0), 0),
  };
}

async function cleanup(runId: string, dealId: string) {
  const { data: prs } = await db.from("purchase_requests").select("id").eq("deal_id", dealId);
  const prIds = (prs ?? []).map((p) => p.id);
  const { data: pos } = prIds.length ? await db.from("purchase_orders").select("id").in("purchase_request_id", prIds) : { data: [] };
  const poIds = (pos ?? []).map((p) => p.id);
  if (poIds.length) await db.from("invoices").delete().in("purchase_order_id", poIds); // payments cascade
  await db.from("invoices").delete().eq("deal_id", dealId);
  await db.from("approvals").delete().eq("run_id", runId);
  await db.from("handoffs").delete().eq("run_id", runId);
  if (prIds.length) await db.from("purchase_requests").delete().in("id", prIds); // quotes, POs, receipts cascade
  await db.from("agent_runs").delete().eq("id", runId); // steps cascade
  await db.from("deals").delete().eq("id", dealId); // line items cascade
}

async function runOnce(i: number): Promise<RunReport> {
  const dealId = await createDeal(i);
  const started = Date.now();
  const job = await enqueue("run.start", { agent: "sales", goal: `Fulfill won deal ${dealId} (eval #${i})`, deal_id: dealId, inject_anomaly: true });
  let runId: string | null = null;
  try {
    runId = await waitForRun(job.id);
    for (;;) {
      const { data: run } = await db.from("agent_runs").select("status").eq("id", runId).single();
      if (run?.status !== "running") break;
      if (Date.now() - started > HARD_TIMEOUT_MS) break;
      await autoApprove(runId);
      await sleep(250);
    }
    const ms = Date.now() - started;
    const r = await check(runId, dealId, ms);
    const pass = r.failures.length === 0;
    if (pass && !process.argv.includes("--keep")) await cleanup(runId, dealId);
    return { run: i, runId, pass, seconds: Math.round(ms / 100) / 10, ...r };
  } catch (err) {
    return { run: i, runId, pass: false, seconds: (Date.now() - started) / 1000, steps: 0, llmCalls: 0, fallbacks: 0, tokens: 0, failures: [String(err)] };
  }
}

async function cleanupAll() {
  const { data: deals } = await db.from("deals").select("id").like("title", "[eval]%");
  for (const d of deals ?? []) {
    const { data: runs } = await db.from("agent_runs").select("id").contains("options", { deal_id: d.id });
    for (const r of runs ?? []) await cleanup(r.id, d.id);
    await db.from("deals").delete().eq("id", d.id);
  }
  console.log(`removed ${deals?.length ?? 0} eval deal(s)`);
}

async function main() {
  if (process.argv.includes("--cleanup")) return cleanupAll();
  const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 5);
  const logs: string[] = [];
  const worker = startWorker({ workerId: `eval-${process.pid}`, concurrency: 4, pollMs: 150, log: (m) => logs.push(m) });
  const reports: RunReport[] = [];
  try {
    for (let i = 1; i <= n; i++) {
      const r = await runOnce(i);
      reports.push(r);
      console.log(`run ${i}: ${r.pass ? "PASS" : "FAIL"} in ${r.seconds}s, ${r.steps} steps, ${r.llmCalls} LLM calls, ${r.fallbacks} fallbacks, ${r.tokens} tokens${r.pass ? "" : `\n  run_id=${r.runId}\n  - ${r.failures.join("\n  - ")}`}`);
    }
  } finally {
    await worker.stop();
  }
  const passed = reports.filter((r) => r.pass).length;
  const secs = reports.map((r) => r.seconds).sort((a, b) => a - b);
  console.log(`\nGolden path + anomaly: ${passed}/${n} passed. Duration p50 ${secs[Math.floor(secs.length / 2)]}s, max ${secs[secs.length - 1]}s.`);
  const problems = logs.filter((l) => /FAILED|retry|requeued/.test(l));
  if (problems.length) console.log(`Worker retries/failures:\n  ${problems.join("\n  ")}`);
  process.exit(passed === n ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
