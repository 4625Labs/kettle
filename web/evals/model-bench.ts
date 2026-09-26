// Model bench (task 1): runs each candidate model through N forced tool calls shaped like
// Kettle's real agent decisions and reports validity %, repair usage, and p50/p95 latency.
//   npm run bench                 # all candidates, 20 calls each
//   npm run bench -- glm-5.3 10   # one model, 10 calls
import { z } from "zod";
import { callTool, type ChatMessage } from "../src/lib/agent/inference";

const CANDIDATES = ["deepseek-v4.1-flash", "glm-5.3", "qwen3.8-flash-next", "laguna-s-2.1"];

const vendorPick = z.object({
  vendor_id: z.enum(["V1", "V2", "V3"]),
  rationale: z.string().min(10).max(600),
});
const route = z.object({
  agent: z.enum(["sales", "procurement", "finance"]),
  action: z.enum(["handle_purchase_request", "issue_customer_invoice", "expect_vendor_invoice", "handle_invoice_anomaly", "rematch_invoice"]),
  rationale: z.string().min(5).max(400),
});

function vendorCase(i: number): ChatMessage[] {
  const qty = 100 + i * 10;
  return [
    { role: "system", content: "You are Kettle's Procurement agent. Choose one vendor. Scores are computed by code; you pick and explain in 1-2 sentences." },
    {
      role: "user",
      content: `Purchase request: ${qty} laptops needed in ${20 + (i % 5)} days, target $200/unit.
Scored quotes (higher score is better):
- V1 Northwind: $${185 + (i % 4)}/unit, lead ${24 + (i % 3)} days, reliability 0.75, score ${(0.61 + (i % 3) * 0.01).toFixed(2)}
- V2 Fabrikam: $${215 + (i % 3)}/unit, lead 7 days, reliability 0.97, score 0.66
- V3 Contoso: $195/unit, lead 12 days, reliability 0.90, score ${(0.78 - (i % 2) * 0.02).toFixed(2)}`,
    },
  ];
}

function routeCase(i: number): ChatMessage[] {
  const types = ["purchase_request.create", "customer_invoice.create", "vendor_invoice.expect", "invoice.anomaly", "invoice.corrected"];
  const t = types[i % types.length];
  return [
    { role: "system", content: "You are Kettle's orchestrator. Route the pending handoff to exactly one allowed (agent, action)." },
    {
      role: "user",
      content: `Pending handoff type: ${t}
Allowed routes:
- purchase_request.create -> procurement.handle_purchase_request
- customer_invoice.create -> finance.issue_customer_invoice
- vendor_invoice.expect -> finance.expect_vendor_invoice
- invoice.anomaly -> procurement.handle_invoice_anomaly
- invoice.corrected -> finance.rematch_invoice`,
    },
  ];
}

const EXPECTED_ROUTE: Record<string, string> = {
  "purchase_request.create": "procurement.handle_purchase_request",
  "customer_invoice.create": "finance.issue_customer_invoice",
  "vendor_invoice.expect": "finance.expect_vendor_invoice",
  "invoice.anomaly": "procurement.handle_invoice_anomaly",
  "invoice.corrected": "finance.rematch_invoice",
};

function pct(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function benchModel(model: string, n: number) {
  const latencies: number[] = [];
  let valid = 0;
  let firstTry = 0;
  let correct = 0;
  const errors: string[] = [];
  const tokens = { in: 0, out: 0 };

  // Run in small parallel batches, like the worker will under load, but keep it gentle.
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let b = 0; b < idx.length; b += 4) {
    await Promise.all(
      idx.slice(b, b + 4).map(async (i) => {
        try {
          if (i % 2 === 0) {
            const r = await callTool(vendorCase(i), { name: "select_vendor", description: "Select the winning vendor", schema: vendorPick }, { model, timeoutMs: 45_000 });
            latencies.push(r.latencyMs);
            valid++;
            if (r.attempts === 1) firstTry++;
            correct++; // any allowed vendor is a valid choice; the schema already enforces the set
            tokens.in += r.tokensIn;
            tokens.out += r.tokensOut;
          } else {
            const msgs = routeCase(i);
            const r = await callTool(msgs, { name: "route_handoff", description: "Route the handoff", schema: route }, { model, timeoutMs: 45_000 });
            latencies.push(r.latencyMs);
            valid++;
            if (r.attempts === 1) firstTry++;
            const type = msgs[1].content.split("\n")[0].replace("Pending handoff type: ", "");
            if (`${r.data.agent}.${r.data.action}` === EXPECTED_ROUTE[type]) correct++;
            tokens.in += r.tokensIn;
            tokens.out += r.tokensOut;
          }
        } catch (err) {
          errors.push(err instanceof Error ? err.message.slice(0, 160) : String(err));
        }
      }),
    );
  }

  latencies.sort((a, b) => a - b);
  return {
    model,
    calls: n,
    validPct: Math.round((valid / n) * 100),
    firstTryPct: Math.round((firstTry / n) * 100),
    correctPct: Math.round((correct / n) * 100),
    p50: pct(latencies, 50),
    p95: pct(latencies, 95),
    avgTokOut: valid ? Math.round(tokens.out / valid) : 0,
    errors: errors.slice(0, 3),
  };
}

async function main() {
  const [onlyModel, nArg] = process.argv.slice(2);
  const models = onlyModel ? [onlyModel] : CANDIDATES;
  const n = Number(nArg ?? 20);
  const rows = [];
  for (const m of models) {
    process.stderr.write(`benching ${m}...\n`);
    rows.push(await benchModel(m, n));
  }
  console.table(rows.map(({ errors: _e, ...r }) => r));
  for (const r of rows) if (r.errors.length) console.log(r.model, "errors:", r.errors);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
