"use client";

import type { AgentStep } from "@/app/run/_mock/types";
import { LANE_LABEL } from "./lanes";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Pre({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-border bg-background p-3 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function StepInspectorDrawer({
  step,
  onClose,
}: {
  step: AgentStep | null;
  onClose: () => void;
}) {
  const open = step !== null;

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Step inspector"
        className={`absolute top-0 right-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-surface p-6 shadow-xl transition-transform duration-200 motion-reduce:transition-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {step && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                  {LANE_LABEL[step.agent]}
                </p>
                <h2 className="text-lg font-semibold">{step.action}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-sm text-foreground/50 hover:bg-background hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-foreground/80">{step.summary}</p>

            <Section title="Reasoning">
              <p className="text-sm leading-relaxed text-foreground/80">{step.rationale}</p>
            </Section>

            <Section title="Input">
              <Pre value={step.input} />
            </Section>

            <Section title="Output">
              <Pre value={step.output} />
            </Section>

            <Section title="Model">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <dt className="text-foreground/50">Model</dt>
                <dd>{step.model}</dd>
                <dt className="text-foreground/50">Latency</dt>
                <dd>{step.latencyMs} ms</dd>
                <dt className="text-foreground/50">Tokens in / out</dt>
                <dd>
                  {step.tokensIn} / {step.tokensOut}
                </dd>
              </dl>
            </Section>

            {step.linkedRecords && step.linkedRecords.length > 0 && (
              <Section title="Linked records">
                <ul className="flex flex-col gap-1 text-sm">
                  {step.linkedRecords.map((record) => (
                    <li key={record.id} className="flex justify-between gap-2">
                      <span className="text-foreground/50">{record.label}</span>
                      <span className="font-mono text-xs">{record.id}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
