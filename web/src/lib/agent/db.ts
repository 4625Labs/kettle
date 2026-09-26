// Service-role Supabase client for the worker and agents. Deliberately free of next/headers so the
// worker bundle (esbuild, plain Node) and evals can import it. Never import this from client code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type Db = SupabaseClient<Database>;

let cached: Db | undefined;

export function serviceDb(): Db {
  if (!cached) {
    // SUPABASE_URL wins so the worker can use the private VPC address while the browser-facing
    // NEXT_PUBLIC_SUPABASE_URL points at the public proxy.
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set");
    cached = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

/** Unwraps a Supabase response, throwing on error (or on a missing row when `required`). */
export function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: not found`);
  return res.data;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}
