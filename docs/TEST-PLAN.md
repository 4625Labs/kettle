# Kettle: Live Test Plan

Manual test of the deployed site at **https://kettle.4625labs.com**. The QA & docs agent reuses these
scenarios for the Playwright smoke test. Scenarios **1, 3, 4, 7** matter most for judging.

## Before you start

- **Kettle passwords:** read the three hosted demo passwords yourself (never paste them anywhere):
  ```bash
  ssh -i ~/.ssh/kettle_vultr -o StrictHostKeyChecking=accept-new -o ProxyCommand="ssh -i ~/.ssh/kettle_vultr -W %h:%p -o StrictHostKeyChecking=accept-new root@144.202.22.122" root@10.10.0.4 "grep KETTLE_ /root/supabase/.env"
  ```
  This only works from the allowlisted IP (VM-C accepts SSH from 12.94.170.82/32).
- **NetBird password:** the one set on the `kettle.4625labs.com` service in the NetBird dashboard.
- **Two browser windows:** one normal and one private, so you can be the ops manager and the finance controller at the same time.

| User | Role |
|---|---|
| `ops@kettle.demo` | Ops Manager: approves POs ≥ $10k, can reset the demo |
| `sales@kettle.demo` | Sales Rep: view and start only |
| `finance@kettle.demo` | Finance Controller: approves payments |

## 1. Access and gating
| Step | Expected |
|---|---|
| Open the URL in a fresh private window | NetBird password page, not Kettle |
| Enter a wrong NetBird password | Rejected |
| Enter the correct NetBird password | Kettle landing page |
| Open `/run` while signed out | Redirected to `/login` |
| Sign in with a wrong Kettle password | "Invalid email or password." |

## 2. Roles
| User | Expected |
|---|---|
| ops | Nav badge "Ops Manager"; Start and Reset both work |
| sales | Badge "Sales Rep"; Start works; Reset shows an error |
| finance | Badge "Finance Controller"; Start shows an error |

## 3. Happy path, anomaly off (~2 min)
1. Ops: **Reset**, leave **Inject anomaly** off, then **Start**.
2. Cards stream into the Sales, Procurement, and Finance lanes without a page reload, in this order: deal validated, purchase request, RFQ to 3 vendors, vendor selected (with scores), PO created. Handoff arrows connect the lanes.
3. The PO approval card pulses "Needs approval".
4. Ops → **Approvals** → approve the PO. The Run view resumes: PO issued, goods received, invoice extracted, 3-way match green, payment scheduled.
5. Finance window → **Approvals** shows only the payment → approve.
6. Customer payment, then "run complete".

## 4. Demo scenario, anomaly on
1. Ops: **Reset**, turn **Inject anomaly** on, then **Start**. Approve the PO.
2. The invoice match turns **amber (flagged)**. The vendor billed about 7–11% over the quote; amounts vary per run.
3. Finance hands the invoice back to Procurement, which disputes it (the vendor's reply is shown). A corrected invoice arrives and the match turns **green**.
4. Finance approves the payment and the run completes.

## 5. Approval permissions
| User | Approvals inbox |
|---|---|
| sales | Empty, nothing to approve |
| finance | Payments only |
| ops | Everything, including POs |

## 6. Rejection
Start a run and **reject** the PO with a note. Expected: a "run stopped" card, the run ends as failed, and nothing further happens.

## 7. Per-run link (NetBird N4)
1. While a run is active, the ops manager sees a banner with a URL and PIN on the Run page.
2. Open the URL in a private window. Expected: a NetBird PIN prompt, then the correct PIN opens a read-only page for that run, with no Kettle login.
3. After the run completes, the banner disappears and the link stops working within about 90 seconds.

## 8. Step inspector
Click any step card. Expected: a drawer with input, output, rationale, model, latency, and tokens.

## 9. Presentation
At 1280×720 (projector) and at phone width, all text stays readable and nothing is clipped.

## 10. Deal page (after the next deploy)
Open **Deals** → the demo deal. Expected: line items, purchase request, vendor quotes with each vendor's message, PO with status badge and its approval, invoices with extracted fields and confidence, and payments.

## Reporting
For each scenario number: pass or fail, plus a screenshot or the exact error text for any failure.
