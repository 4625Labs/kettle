// The seam between agents-core and Sim-world (agreed interface, see docs/agents). Everything the
// agents need from the simulated world comes through here, so switching from the stub to the real
// Sim-world modules is a change to the re-exports at the bottom of this file only.
import type { JobKind } from "@/lib/contracts";
import type { Db } from "./db";

export interface SimJob {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
}

export interface SimDeps {
  supabase: Db;
  enqueue: (kind: JobKind, payload: unknown) => Promise<unknown>;
}

export type SimJobHandler = (job: SimJob, deps: SimDeps) => Promise<void>;

export interface ExtractedInvoice {
  fields: {
    invoice_number: string;
    po_number: string;
    vendor_name: string;
    quantity: number;
    unit_price: number;
    total: number;
    due_date: string;
  };
  confidence: Partial<Record<keyof ExtractedInvoice["fields"], number>>;
  model: string;
  latencyMs: number;
}

// TODO(sim-world): replace with
//   export { simHandlers, generateVendorInvoice } from "@/lib/sim";
//   export { extractInvoice } from "@/lib/documents";
export { simHandlers, generateVendorInvoice, extractInvoice } from "./sim-stub";
