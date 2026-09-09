/** Public input/output types. No data source is bundled; callers pass the numbers. */

/** Per-chart values needed by V1 (original / current BPI). */
export interface ChartV1 {
  /** Note count. Theoretical max `m = notes * 2`. */
  notes: number;
  /** Kaiden-average score (`k`, the BPI 0 anchor). `null` if unknown. */
  kaidenAvg: number | null;
  /** World-record score (`z`, the BPI 100 anchor). `null` if unknown. */
  wrScore: number | null;
  /** Per-song power exponent. Falls back to the default (1.175) when unset or <= 0. */
  coef?: number | null;
}

/**
 * Per-chart values needed by V2 (distribution-based BPI).
 * `mu` / `sigma` / `residualVar` come from the ALS fit.
 */
export interface ChartV2 extends ChartV1 {
  /** ALS song position (difficulty). Chart is out of scope for V2 when missing. */
  mu?: number | null;
  /** ALS song discrimination. Chart is out of scope for V2 when missing. */
  sigma?: number | null;
  /** Per-song ALS residual variance (t units). Falls back to `residualRmse ** 2`. */
  residualVar?: number | null;
}

/** One point of the empirical percentile <-> latent-skill (`a_i`) curve. */
export interface RankCurvePoint {
  /** 0..1, ascending. */
  percentile: number;
  /** `a_i` at that percentile (non-increasing as percentile grows). */
  a: number;
}

/** V2 model-wide constants (one set per data vintage). */
export interface BpiV2Config {
  /** BPI 0 anchor (median `a_i` of the reference population). */
  z0: number;
  /** `gamma` calibration point (`a_i` 95th percentile position). */
  zRef: number;
  /** Median of per-song WR positions `z100_j`. */
  z100Median: number;
  /** Interquartile range of `z100_j` (used for the `gamma` confidence weight). */
  z100Iqr: number;
  /** ALS residual RMSE (t units). Used for `a_i` shrinkage when `residualVar` is absent. */
  residualRmse: number;
  /** Median `coef` across songs. Fallback when a chart's `coef` is unset. */
  coefMedian: number;
  /** Empirical percentile <-> `a_i` curve. */
  rankCurve: RankCurvePoint[];
  /** Population size for percentile -> absolute rank conversion. */
  arenaPopulationSize: number;
  /** Single-chart BPI floor. Default -15. */
  bpiFloor?: number;
  /** Shift amount for the total-BPI shift method. Default 15. */
  totalBpiShift?: number;
  /** Clamp for `gamma` as `[min, max]`. Default `[0.3, 3]`. */
  gammaClamp?: readonly [number, number];
  /** Clamp for the effective exponent `k = clamp(gamma * coef)`. Default `[0.62, 3]`. */
  curveExpClamp?: readonly [number, number];
  /** Base for single-BPI -> rank. Default 2616. */
  rankBaseSingle?: number;
}

/** V1 model constants (all optional). */
export interface BpiV1Config {
  /** Default exponent when a chart's `coef` is unset or <= 0. Default 1.175. */
  defaultPowCoef?: number;
  /** Base for total-BPI -> rank. Default 2699. */
  rankBaseTotal?: number;
  /** Base for single-BPI -> rank. Default 2616. */
  rankBaseSingle?: number;
}

/** V2 display parameters for one chart. */
export interface ChartParamsV2 {
  mu: number;
  sigma: number;
  z0: number;
  /** z value of this chart's real WR (BPI 100 anchor). */
  z100: number;
  /** WR-position outlier correction exponent (confidence-weighted). */
  gamma: number;
  /** Inherited per-song curve exponent. */
  coef: number;
  /** Effective exponent `k = clamp(gamma * coef, ...)`. */
  k: number;
}

/** One played chart + score, fed to V2 latent-skill estimation. */
export interface PlayedScoreV2 {
  chart: ChartV2;
  exScore: number;
}
