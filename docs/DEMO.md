# Kettle: Live Demo Script & Production Checklist

## 3-Minute Live Demo Script

**Objective:** Show the "wow" moment — a multi-agent workflow that detects and fixes a real problem in real time.

**Setup:** Laptop + projector (1280×720). Two browsers: one for Ops Manager (primary), one for Finance Controller (secondary, for final approval). Supabase demo already reset.

---

### Beat 1: The Problem (0:00–0:20)

**What you say:**
> "Most companies have a problem: one customer order touches three teams with no shared system. Sales closes a deal, Procurement re-keys it into a spreadsheet, Finance hunts for the matching invoice weeks later. Every handoff is manual, slow, and lossy."

**What's on screen:**
- Black screen or landing page (kettle.4625labs.com).

**What you do:**
- Nothing yet; just set the stage.

---

### Beat 2: Introduce Kettle (0:20–0:35)

**What you say:**
> "This is Kettle: a flock of AI agents — Sales, Procurement, Finance — that run your back office together on Vultr. They share one ledger, hand work to each other, and push back when something doesn't add up. Every action is recorded in a live, auditable trail."

**What's on screen:**
- Click to the Run page (`/run`). Show the three empty lanes (Sales, Procurement, Finance) + the execution trail on the right.

**What you do:**
- Position the Ops Manager window so judges can see all three lanes clearly.
- Point out the real-time Realtime subscriptions (mention "updates every ~1 second as events arrive").

---

### Beat 3: Start the Workflow (0:35–0:45)

**What you say:**
> "Let's mark a deal won: Acme Retail, 200 laptops, $48,000, needed by November 15th."

**What's on screen:**
- Ops Manager window, Run page.

**What you do:**
- Click the **Reset** button to clear any old runs (ensure a clean slate).
- Toggle **Inject anomaly** OFF (for now; we'll turn it on later).
- Click **Start** to begin the workflow.

**Expected:**
- In ~1–2 seconds, a card appears in the Sales lane: "Deal validated" (with reasoning about margin, customer, timeline).
- Trail updates on the right (showing orchestrator routing decision, Sales agent step).

---

### Beat 4: Procurement Quotes & Scoring (0:45–1:15)

**What you say:**
> "Procurement agent just got the request. It's sending RFQs to three vendors in parallel, scoring them on price, lead time, and reliability."

**What's on screen:**
- Watch the Procurement lane fill up.

**Expected cards (in this order):**
1. "Purchase request received"
2. "RFQ to Northwind, Fabrikam, Contoso" (with prices as they arrive)
3. "Vendor comparison" or "Scoring" (showing the winning vendor with rationale: "Northwind at $190/unit beats Fabrikam ($198) and Contoso ($205). Lead time 5 days is safe (needed by Nov 15).")
4. "Purchase order issued" (amount $38,000 for 200 @ $190)
5. A **pulsing "Needs approval"** card (PO exceeds $10k threshold).

**What you do:**
- Pause here for ~5 seconds so judges can see the step inspector (click a card to see input/output/rationale/model/tokens).
- Click one of the Procurement cards (e.g., "Vendor comparison") to open the drawer and show: input (RFQ responses), output (scoring logic), rationale (LLM's reasoning), model name (deepseek-v4.1-flash), latency (~1.2s), tokens (~180).

---

### Beat 5: Human Approval Gate (1:15–1:25)

**What you say:**
> "The PO is above the $10,000 approval threshold. An approval request goes to the Ops Manager."

**What's on screen:**
- Still showing the pulsing "Needs approval" card.

**What you do:**
- Click the **Approvals** button in the top nav (or directly click "Needs approval").
- Should show an approval request: "PO $38,000 for Acme Retail — approve/reject with optional note."
- Click **Approve** (optionally add a note: "Looks good, Northwind is reliable").

**Expected:**
- Approval is recorded (timestamp, approver, note).
- A job is enqueued (Postgres trigger 0004 fires).
- Worker picks it up and resumes Procurement.

---

### Beat 6: Finance Checks In (1:25–2:00)

**What you say:**
> "Procurement issued the PO. Finance is now watching for the vendor invoice. When it arrives, Finance will extract fields from the PDF using a vision model and perform a 3-way match: PO amount vs. invoice amount vs. goods receipt."

**What's on screen:**
- Back to Run page; watch the Finance lane fill up.

**Expected cards (in order):**
1. "Vendor invoice received" or "Ingesting invoice" (showing the PDF icon).
2. "Fields extracted" (showing confidence scores for vendor name, date, amount, etc.).
3. "Goods receipt matched" (typically automatic in this demo).
4. **"3-way match: GREEN"** (or AMBER if anomaly is on).

**What you do:**
- If anomaly is OFF, skip to beat 7.
- If anomaly is ON (which we'll show next), stay here and watch the match turn AMBER.

---

### Beat 7: THE TWIST — Anomaly Detection & Resolution (1:30–2:30) [IF ANOMALY IS ON]

**Setup (do this first):**
- Close the current run (or reset again).
- Go back to Run page.
- This time, toggle **Inject anomaly** ON.
- Click **Start** again.
- **Skip through beats 3–6 quickly** (agents are now moving faster). Watch for:
  - Sales validates deal.
  - Procurement sends RFQs (same three vendors, same quotes).
  - Approve PO when it arrives.
  - Watch Finance's 3-way match turn **AMBER**.

**What you say (when the match turns AMBER):**
> "Wait — the vendor overbilled! They quoted $190 per unit but invoiced $212. That's 11% over. Finance detected the mismatch and is handing it back to Procurement."

**What's on screen:**
- Finance lane shows "3-way match: FLAGGED" or "AMBER" (depending on color scheme).
- A new card appears in Procurement: "Invoice anomaly received" or "Dispute in progress".

**Expected cards (in Procurement, then back to Finance):**
1. "Anomaly detected: vendor overbilled by $4,400" (or similar).
2. "Dispute drafted: 'Your invoice shows $212/unit, but your quote was $190. Please correct.'" (message shown on card).
3. "Vendor response: 'Correction sent; our system had a pricing error. New invoice $190/unit.' "
4. Back to Finance: "Corrected invoice received" or "Rematch in progress".
5. "3-way match: GREEN" ✅ (now it passes).
6. A pulsing "Needs approval" card in Finance (payment approval gate).

**What you do:**
- Point out the execution trail on the right: **all three lanes light up** as agents communicate back and forth. This is the "kettle" moment — agents circling together.
- Click a Procurement card to show the dispute message (step inspector drawer).

**What you say:**
> "This is why you need agents that can push back on each other. Procurement didn't just accept a bad invoice — it caught the problem, disputed it with the vendor, and got a correction. All three lanes are part of one auditable trail."

---

### Beat 8: Final Approval & Done (2:30–2:50)

**What you say:**
> "Finance approved the payment. Customer invoice is paid. Order fulfilled & collected. Let's check the deal page to see the full lifecycle."

**What's on screen:**
- Finance window (secondary browser, now needed for payment approval).

**What you do:**
1. In the primary (Ops Manager) window, watch the "Needs approval" card in Finance.
2. Switch to the Finance Controller window (secondary browser).
3. Go to **/approvals** or click the Approvals link.
4. Click **Approve** on the payment (e.g., "$38,000 payment for Acme Retail").
5. Back to the Ops window, watch the Finance lane complete:
   - "Payment scheduled" or "Payment approved".
   - "Customer paid" or "Run complete".
6. Optionally, click **Deals** in the nav to show the full lifecycle on the deal detail page (line items, purchase request, vendor quotes, PO, invoice with extracted fields, payment status).

---

### Beat 9: The Payoff — Vultr Architecture (2:50–3:00)

**What you say:**
> "All of this — three agents, one ledger, real-time updates, approval gates, policy enforcement — is running on Vultr. Zero inbound ports on the app and database VMs; traffic flows through a NetBird reverse proxy. And each workflow gets an ephemeral URL that expires when it's done, so judges can watch their own run live."

**What's on screen:**
- Can show the deployment diagram or just recap: three Vultr VMs, Supabase, Serverless Inference.
- Or show the banner on the Run page (if N4 is enabled): "This run is accessible at [ephemeral URL] with PIN [PIN] for the next ~90 seconds."

---

## 1-Minute Video (For Submission)

### Shot List

| Time | Shot | Audio |
|------|------|-------|
| 0:00–0:05 | Title card: "Kettle: Enterprise Back-Office Orchestration" | (music/voiceover: "This is Kettle.") |
| 0:05–0:15 | Problem: 3 teams, 3 systems, manual handoffs. Show slide or mockup. | "One order touches three teams. Sales. Procurement. Finance. No shared system. Every handoff is manual, slow, lossy." |
| 0:15–0:20 | Landing page / Run page empty. | "Kettle: AI agents running your back office on Vultr." |
| 0:20–0:30 | Click Reset, click Start. Cards stream in. Sales validates deal. | "Click start. Agents take over." |
| 0:30–0:45 | Procurement lane fills: RFQ, scoring, PO. Pause on approval card. | "Procurement sends RFQs, scores vendors, issues a PO. Big orders need approval." |
| 0:45–0:50 | Approvals page. Click Approve PO. | "Ops manager approves in seconds." |
| 0:50–1:00 | Back to Run. Finance lane: invoice extraction, 3-way match. Then: match turns AMBER, dispute cycle (Procurement ↔ Vendor), match turns GREEN. | "Finance detects an overbill. Disputes it. Vendor corrects. The agents coordinated without a human in between. Real-time, auditable." |
| 1:00–1:10 | Payment approval in Finance window. Run completes. | "Final approval. Done." |
| 1:10–1:15 | Deal page showing full lifecycle (line items, quotes, PO, invoices, payments). | "Full audit trail on one page." |
| 1:15–1:20 | Diagram or architecture slide: "3 Vultr VMs, zero inbound ports, NetBird reverse proxy, Supabase, Serverless Inference." | "All on Vultr. All auditable. All policy-gated." |
| 1:20–1:30 | Outro: "GitHub repo with docs, setup, tests. Runs locally or on Vultr." | (logo/credits) |

**Production notes:**
- **Resolution:** 1280×720 or higher (projector standard).
- **Pacing:** 1.5–2x speed during RFQ/dispute waiting (no dead air).
- **Audio:** Clear voiceover or captions per beat.
- **Colors:** Use the system's theme colors (blue=Sales, purple=Procurement, green=Finance, gray=Orchestrator).
- **Subtitles:** Captions for each beat (helps judges follow if projector audio is bad).

---

## Q&A Prep: One-Liners

Have these ready for judges' questions:

### "What stops an agent from paying the wrong invoice?"

**Answer:**
> "Three guardrails: (1) Deterministic 3-way match logic in code — amount within ±5%, quantity exact, vendor must match. (2) Finance Controller must explicitly approve every payment (approval gate). (3) Full step/handoff ledger is immutable and auditable — if an agent makes a mistake, it's logged forever and can be reviewed/contested."

### "What if the LLM returns garbage?"

**Answer:**
> "The model outputs are validated against a Zod schema. If the JSON is malformed, the agent retries up to 2 times. If it still fails, the step is escalated to a human (K6). For numbers and matching, we use deterministic code, not LLM. LLM is only used for reasoning (vendor scoring, dispute drafting) and text generation (vendor personas). If Vultr Serverless Inference is slow or down, we have a fallback scoring algorithm."

### "Why AI orchestrator vs a state machine?"

**Answer:**
> "State machines are rigid — you hardcode every state and transition upfront. With AI orchestration and an allow-list, agents can communicate flexibly. If we discover a new handoff type the business needs (e.g., Sales ↔ Finance directly), we add it to the allow-list; no code refactoring. And every routing decision is logged with the LLM's reasoning, so auditors see *why* Procurement was chosen, not just that it was."

### "What's actually on Vultr?"

**Answer:**
> "Three VMs: VM-A runs our Next.js app and worker (Docker), VM-B runs Supabase (Postgres, Auth, Realtime), VM-C is NetBird reverse proxy. The app and database have zero inbound ports (firewall rules deny all); traffic flows only through the proxy. Inference runs on Vultr's Serverless Inference (managed service, OpenAI-compatible API). No GPU; we use efficient models (deepseek-v4.1-flash for agents, laguna-s-2.1 for vendor personas)."

### "What did you build this weekend vs before?"

**Answer:**
> "Everything from scratch: the app, agents, ledger, orchestrator, UI, Vultr infrastructure. The core architecture was designed at the beginning, but all code (web, worker, database migrations, Ansible playbooks, diagrams) was built during the event. We went from zero to a deployed, working multi-agent system on Vultr in ~36 hours."

### "How would this connect to real ERPs?"

**Answer:**
> "The agent protocol is just handoffs (structured data). A real Salesforce integration would be a Handoff trigger: when a deal is won in SF, a `deal.won` event is enqueued; agents process it and write results back to SF. Same for SAP procurement or QuickBooks accounting. The hard part isn't the API calls — it's the orchestration and guardrails, which Kettle solves. So Kettle could sit in front of your existing systems and coordinate them."

---

## Pre-Judging Checklist

**Do this right before submission (within the hour before judging starts):**

### 1. Data Reset
```bash
cd web
npm run demo:reset
# Verify:
# - No runs in the database
# - Demo deal "Acme Retail, 200 laptops" exists in 'qualifying' state
# - No approval requests pending
```

### 2. Full Rehearsal (Anomaly OFF)
- [ ] Sign in as ops@kettle.demo (Ops Manager).
- [ ] Reset, Start workflow.
- [ ] Verify all cards appear in <10s each.
- [ ] Approve PO when prompted.
- [ ] Verify Finance 3-way match turns GREEN.
- [ ] Approve payment as finance controller.
- [ ] Run completes within ~20s total.
- [ ] Open Deals page; verify lifecycle is visible.

### 3. Full Rehearsal (Anomaly ON)
- [ ] Reset, toggle **Inject anomaly** ON.
- [ ] Start workflow.
- [ ] Verify PO approval.
- [ ] Verify Finance detects mismatch (AMBER).
- [ ] Verify Procurement disputes.
- [ ] Verify Vendor correction arrives and match turns GREEN.
- [ ] Approve payment.
- [ ] Run completes successfully.

### 4. Backup Video
- [ ] Record a clean run (anomaly OFF) from your laptop using a screen recorder (e.g., QuickTime, ScreenFlow).
- [ ] Save as `kettle-demo-backup.mp4` in case of network failure.
- [ ] Upload to a cloud storage (Google Drive, S3) in case the venue WiFi is unreliable.

### 5. Credentials Ready
- [ ] Have the three demo logins (ops, sales, finance) and password written down on a sticky note.
- [ ] Have the NetBird password (if applicable for the deployed instance).
- [ ] Do NOT paste them into slides or send via email.

### 6. Vultr Status Check
- [ ] Verify the URL https://kettle.4625labs.com is reachable.
- [ ] Sign in and start a quick test run (can be the same run the backup video shows).
- [ ] Check the VM health in Vultr console (3 VMs running, no alerts).

### 7. Slides / Talking Points
- [ ] Rehearse the 3-minute script (beats 1–9 above).
- [ ] Have the Q&A one-liners memorized or written down.
- [ ] Know how to open the step inspector (click a card) and explain what you see.

### 8. Laptop Setup
- [ ] Close all other tabs/windows (judges should see only Kettle).
- [ ] Set resolution to 1280×720 (or higher) for projector clarity.
- [ ] Enable Do Not Disturb (silence Slack, email, etc.).
- [ ] Have both browsers open and logged in (Ops Manager + Finance Controller).
- [ ] Test projector HDMI beforehand.

### 9. Final Checks
- [ ] Run the Playwright smoke test locally (if time):
  ```bash
  npm test
  ```
  All tests should pass (or be marked skip for deployed-only tests).

- [ ] Verify the demo reset script works:
  ```bash
  # Log into the app as ops manager
  # Click Reset button
  # Refresh page, verify no runs exist
  ```

- [ ] Verify real-time updates (open Run page, trigger a step in the worker, watch the card appear <1s).

### 10. If Anything Breaks (Triage)
| Problem | Triage | Fallback |
|---------|--------|----------|
| LLM is slow (> 30s/call) | Check Vultr Serverless Inference quota; restart worker. | Use backup video; explain fallback logic. |
| Database is corrupted | Roll back with a fresh Supabase snapshot or re-apply migrations. | Use backup video; re-provision VM-B if needed. |
| NetBird reverse proxy is down | SSH to VM-C, restart NetBird services. | Run locally on laptop; explain that production is on Vultr. |
| Network failure during demo | Use the backup video. Play it full-screen while explaining the beats. | Have a PDF of slides with screenshots as fallback. |
| Judges want to see code | Open GitHub in a separate tab. | Or use `less` in terminal to show source files. |

---

## Submission Checklist (Post-Demo)

- [ ] **GitHub repo is public** and linked in the submission.
- [ ] **README.md** has setup instructions (local + Vultr) and architecture overview.
- [ ] **docs/ARCHITECTURE.md** explains agents, handoffs, guardrails.
- [ ] **docs/DEMO.md** (this file) is in the repo.
- [ ] **1-minute video** is uploaded and linked in the submission.
- [ ] **Playwright tests** exist and pass against local Supabase: `npm test`.
- [ ] **Demo URL** (https://kettle.4625labs.com) is live and working.
- [ ] **Demo credentials** are communicated to judges (email, Slack, etc., not in git).
- [ ] **No secrets in git** (Vultr keys, database passwords, API keys).

---

## Timing Notes

- **Total demo duration:** 3 minutes (hard stop at 3:00; judges may have other projects to see).
- **Anomaly OFF run:** ~20 seconds (beats 3–8).
- **Anomaly ON run:** ~30 seconds (longer because of dispute cycle).
- **Buffer:** Always do a dry run 10 minutes before so you know the pacing.

---

## Scoring Notes

**Judges score on:** Technicality (40%) · Creativity (25%) · Live demo (20%) · Future potential (15%).

**How to win each:**

- **Technicality (40%):** Show the multi-agent orchestration working end-to-end. Emphasize real LLM calls, real approval gates, real Vultr infra. Open the step inspector to show reasoning + tokens.
- **Creativity (25%):** Highlight the "twist" (anomaly detection & resolution). Emphasize that agents *push back* on each other, not a linear pipeline. The kettle metaphor (agents circling together).
- **Live demo (20%):** **Must work flawlessly.** Smooth transitions, no errors. Have the backup video ready. Judges notice lag/crashes.
- **Future potential (15%):** Explain how this pattern scales to real ERPs (Salesforce, SAP, QuickBooks). Mention policy-as-code, distributed ledger, real agent-to-agent markets.

---

**Good luck! 🚀**
