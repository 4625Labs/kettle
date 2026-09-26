// The seam between agents-core and Sim-world (agreed interface). Everything the agents need from
// the simulated world comes through here.
export { simHandlers, generateVendorInvoice, type SimJob, type SimJobHandler } from "@/lib/sim";
export { extractInvoice } from "@/lib/documents";
export type { ExtractInvoiceResult as ExtractedInvoice } from "@/lib/documents";
