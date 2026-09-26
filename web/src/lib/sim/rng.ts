// Deterministic pricing/lead-time need a PRNG seeded from ids, not Math.random() — same
// (purchase_request_id, vendor_id) pair always yields the same quote if a job is retried.

function hashStringToSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededFloat(seedKey: string, min: number, max: number): number {
  const rng = mulberry32(hashStringToSeed(seedKey));
  return min + rng() * (max - min);
}
