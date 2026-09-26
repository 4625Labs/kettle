---
name: kettle-demo-production
description: Produce Kettle's 3-minute live demo script, 1-minute submission video plan, judge Q&A prep, and submission checklist, optimized for the hackathon judging rubric.
---

# Skill: Demo production

## Rubric to optimize
Technicality 40% · Creativity 25% · Live demo 20% · Future potential 15% (Round 2: equal weights).
Judges must clearly see what was built during the event.

## 3-minute live demo (target beats)
| Time | Beat |
|---|---|
| 0:00–0:20 | Problem: one order, three teams, three systems, everything re-keyed. |
| 0:20–0:35 | "Kettle: a flock of agents running your back office on Vultr." Show the empty lanes. |
| 0:35–1:30 | Mark deal won → Sales validates → Procurement gets 3 AI-vendor quotes, scores them, asks for PO approval → approve. |
| 1:30–2:20 | **The twist:** vendor PDF invoice arrives overbilled → Finance extracts it (vision), 3-way match fails → hands back to Procurement → dispute → corrected invoice → match → payment approval. |
| 2:20–2:45 | Under the hood: Vultr VMs, Vultr inference, zero open ports via NetBird, per-run expiring URL. |
| 2:45–3:00 | Future: auditable, policy-gated agent-to-agent enterprise ops. |

## 1-minute video
- Screen capture of the same flow sped up where waiting; captions for each beat; end card with repo + architecture.
- Record from the **deployed** URL, not localhost.

## Q&A prep (have one-line answers)
- What stops an agent from paying the wrong invoice? · What if the model returns garbage? · Why AI orchestration vs a state machine? · What's actually on Vultr? · What did you build this weekend vs before? · How would this connect to real ERPs?

## Submission checklist
- [ ] Public repo (push only when the user says so), README with setup + architecture + demo script
- [ ] Public demo URL (NetBird) working and credentials ready for judges
- [ ] 1-minute video uploaded
- [ ] "Reset demo" tested right before judging
- [ ] Backup: recorded run in case of network failure
