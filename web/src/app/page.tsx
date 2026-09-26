import Link from "next/link";
import { getSession } from "@/app/_lib/session";

const STEPS = [
  {
    agent: "sales",
    label: "Sales",
    detail: "Deal marked won — validated, handed off.",
  },
  {
    agent: "procurement",
    label: "Procurement",
    detail: "RFQs, vendor scoring, PO issued.",
  },
  {
    agent: "finance",
    label: "Finance",
    detail: "Invoices matched, payment scheduled.",
  },
] as const;

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex flex-1 flex-col items-center px-6 py-20">
      <div className="flex max-w-2xl flex-col items-center text-center">
        <span className="rounded-full border border-border px-3 py-1 text-xs font-medium uppercase tracking-wide text-foreground/60">
          Vultr Agent Arena · Future of Work
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          One deal. Three agents. One ledger.
        </h1>
        <p className="mt-4 text-lg leading-8 text-foreground/70">
          Kettle is a flock of AI agents — Sales, Procurement, and Finance — that
          run an enterprise&apos;s back office together. They hand work to each
          other, push back when something doesn&apos;t add up, and stop for a
          human on anything that moves money. Every action is executed and
          visible live, not a described plan.
        </p>

        <Link
          href={session ? "/run" : "/login"}
          className="mt-8 rounded-md bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {session ? "Watch the run" : "Sign in to watch a run"}
        </Link>
      </div>

      <div className="mt-16 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <div
            key={step.agent}
            className="relative rounded-xl border border-border bg-surface p-5"
          >
            <span
              className="mb-3 inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: `var(--agent-${step.agent})` }}
            />
            <h2 className="font-semibold">{step.label}</h2>
            <p className="mt-1 text-sm text-foreground/60">{step.detail}</p>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden
                className="absolute top-1/2 -right-4 hidden -translate-y-1/2 text-lg text-foreground/30 sm:block"
              >
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-md text-center text-sm text-foreground/50">
        The twist: a vendor invoice comes in over quote. Finance flags it,
        hands it back to Procurement, and all three lanes light up resolving it
        — live.
      </p>
    </div>
  );
}
