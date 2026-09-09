/** Shared primitives for V1 and V2. */

/** Pika-Great-Function (raw-score form): `PGF(s, m) = m / (2 (m - s))`. */
export function pgf(j: number, m: number): number {
  if (j === m) return m * 0.8;
  return 1 + (j / m - 0.5) / (1 - j / m);
}

/** Distribution-model base quantity `t = -ln(m - s)`, with a floor on the miss count. */
export function tOf(score: number, m: number): number {
  const miss = Math.max(0.5, m - Math.min(Math.max(score, 0), m));
  return -Math.log(miss);
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
