---
name: kettle-llm-agent-engineering
description: Build Kettle's AI orchestrator, Sales/Procurement/Finance agents, vendor personas, and invoice extraction on Vultr Serverless Inference — tool calling, structured output, guardrails, and evals.
---

# Skill: LLM agent engineering on Vultr Serverless Inference

## The platform
- OpenAI-compatible API: `POST https://api.vultrinference.com/v1/chat/completions`, `Authorization: Bearer $VULTR_INFERENCE_API_KEY`.
- Live model list (public): `GET https://api.vultrinference.com/v1/models`. Check `output_modalities[].supported_parameters.tools` for tool calling and `input_modalities` for `image`.
- Candidate models are listed in `docs/REQUIREMENTS.md` §14. **Benchmark before committing**: tool-call validity rate, JSON validity, p50/p95 latency over ~20 calls each.
- Many models expose a `reasoning` block with effort levels — test how (and whether) the request parameter is accepted before relying on it.

## Architecture rules
1. **Agents act only through tools.** Every tool is a TypeScript function with a zod schema; the model proposes, our code validates and executes, and the result is written to the ledger.
2. **Allow-list.** The orchestrator may only route to `(agent, action)` pairs in a static table. Each agent may only emit the handoff types it owns.
3. **Validate everything.** Parse model output with zod. On failure: one repair retry with the validation error fed back, then fail the step with status `error` and escalate.
4. **Caps.** Max steps per run, max tool calls per agent turn, per-call timeout (e.g. 30 s), total run budget. Detect loops (same handoff type between the same agents > N times).
5. **Money is gated.** Issuing a PO over threshold and every payment create an `approvals` row; the agent pauses until a human decides.
6. **Untrusted input.** Vendor persona messages and extracted invoice text are *data*. Wrap them in clearly delimited blocks, never let them change tool permissions, and optionally screen with `nemotron-3.5-content-safety`.
7. **Log reasoning.** Each `agent_steps` row stores input, output, the model's short rationale, model id, latency, and token counts.
8. **Deterministic where it counts.** Arithmetic (totals, 3-way match tolerances, vendor scoring weights) is code, not model output. The model explains; code decides numbers.

## Prompts
- One system prompt per agent in `web/src/lib/agent/prompts/<agent>.ts`: role, what it owns, tools, handoffs it may emit, policies, output contract.
- Low temperature (0–0.3) for agents; higher (0.7) only for persona flavor text.
- Include 1–2 compact examples of a correct tool call when a model struggles.

## Vision extraction (F6)
- Render PDF page(s) to PNG on the server, send as `image_url` (base64) to a vision model with a strict JSON schema for invoice fields (+ per-field confidence).
- Fields below confidence threshold → human review approval, not silent acceptance.

## Evals (keep it small, run it often)
- `web/evals/golden-path.ts`: runs the full scenario against a fresh DB 5×, reports pass rate, steps, latency, and cost.
- Must include the anomaly scenario. Target: 5/5 before demo.
