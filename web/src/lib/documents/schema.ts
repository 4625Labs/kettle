import { z } from "zod";

// F6: fields a vision model extracts from a rendered invoice page, plus its own confidence per
// field (0-1). Low-confidence fields are Finance's cue to route to human review, not ours.
export const extractedInvoiceFieldsSchema = z.object({
  invoice_number: z.string(),
  po_number: z.string().nullable(),
  vendor_name: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  total: z.number(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
});
export type ExtractedInvoiceFields = z.infer<typeof extractedInvoiceFieldsSchema>;

const confidenceValue = z.number().min(0).max(1);
export const extractionConfidenceSchema = z.object({
  invoice_number: confidenceValue.optional(),
  po_number: confidenceValue.optional(),
  vendor_name: confidenceValue.optional(),
  quantity: confidenceValue.optional(),
  unit_price: confidenceValue.optional(),
  total: confidenceValue.optional(),
  due_date: confidenceValue.optional(),
});
export type ExtractionConfidence = z.infer<typeof extractionConfidenceSchema>;

export const extractionResponseSchema = z.object({
  fields: extractedInvoiceFieldsSchema,
  confidence: extractionConfidenceSchema,
});
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

export interface ExtractInvoiceResult {
  fields: ExtractedInvoiceFields;
  confidence: ExtractionConfidence;
  model: string;
  latencyMs: number;
}
