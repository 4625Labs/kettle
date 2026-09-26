import { seededFloat } from "./rng";

const STREET_NUMBERS = [1200, 4400, 850, 2750, 6100, 3300];
const STREET_NAMES = ["Commerce Way", "Industrial Pkwy", "Distribution Ave", "Logistics Blvd", "Freight St"];
const CITIES: [string, string][] = [
  ["Columbus", "OH"],
  ["Reno", "NV"],
  ["Allentown", "PA"],
  ["Plano", "TX"],
  ["Fresno", "CA"],
];

function pick<T>(seedKey: string, options: T[]): T {
  const idx = Math.floor(seededFloat(seedKey, 0, options.length - 0.0001));
  return options[idx];
}

// Cosmetic only (invoices need a plausible-looking header); nothing here is read by extraction
// or matching logic. Deterministic per vendor so the same vendor's invoices stay consistent.
export function fabricateVendorAddress(vendorId: string): string {
  const streetNumber = pick(`addr-num:${vendorId}`, STREET_NUMBERS);
  const streetName = pick(`addr-street:${vendorId}`, STREET_NAMES);
  const [city, state] = pick(`addr-city:${vendorId}`, CITIES);
  const zip = 10000 + Math.floor(seededFloat(`addr-zip:${vendorId}`, 0, 89999));
  return `${streetNumber} ${streetName}\n${city}, ${state} ${zip}`;
}

export function buildInvoiceNumber(vendorName: string, poNumber: string, opts: { corrected?: boolean } = {}): string {
  const prefix = vendorName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
  const poDigits = poNumber.match(/\d+/)?.[0] ?? poNumber;
  return opts.corrected ? `${prefix}-${poDigits}-C` : `${prefix}-${poDigits}`;
}
