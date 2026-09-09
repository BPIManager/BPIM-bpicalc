/** V2: distribution-based (2-parameter latent-ability) BPI (matches bpim2 `NewBpiCalculator`). */
import { clamp, tOf } from "./core";
import type {
  BpiV2Config,
  ChartParamsV2,
  ChartV2,
  PlayedScoreV2,
} from "./types";

/** Defaults for {@link BpiV2Config}. Override any of these via the `BpiV2` constructor. */
export const V2_DEFAULTS = {
  bpiFloor: -15,
  totalBpiShift: 15,
  gammaClamp: [0.3, 3] as readonly [number, number],
  curveExpClamp: [0.62, 3] as readonly [number, number],
  rankBaseSingle: 2616,
} as const;

interface Anchors {
  mu: number;
  sigma: number;
  m: number;
  z0: number;
  z100: number;
  gamma: number;
  coef: number;
  k: number;
}

/** One chart bound for V2 computation. Obtain via `model.chart(row)`. */
export class ChartBpiV2 {
  private readonly a: Anchors | null;
  private readonly floor: number;

  constructor(chart: ChartV2, cfg: Required<BpiV2Config>) {
    this.a = ChartBpiV2.computeAnchors(chart, cfg);
    this.floor = cfg.bpiFloor;
  }

  private static computeAnchors(
    chart: ChartV2,
    cfg: Required<BpiV2Config>,
  ): Anchors | null {
    const { notes, wrScore, mu, sigma } = chart;
    if (mu == null || sigma == null || notes === 0) return null;
    if (wrScore == null) return null;

    const m = notes * 2;
    const z0 = cfg.z0;
    const z100 = (tOf(wrScore, m) - mu) / sigma;
    if (Math.abs(z100 - z0) < 1e-9) return null;

    const gamma = ChartBpiV2.gammaFor(z100, z0, cfg);
    const coef = chart.coef ?? cfg.coefMedian;
    const k = clamp(gamma * coef, cfg.curveExpClamp[0], cfg.curveExpClamp[1]);
    return { mu, sigma, m, z0, z100, gamma, coef, k };
  }

  /** WR-position outlier correction exponent (with IQR confidence weight). */
  private static gammaFor(
    z100: number,
    z0: number,
    cfg: Required<BpiV2Config>,
  ): number {
    const gRef = cfg.z100Median - z0;
    const gSong = z100 - z0;
    const rTyp = (cfg.zRef - z0) / gRef;
    const rSong = (cfg.zRef - z0) / gSong;
    if (rTyp <= 0 || rTyp >= 1 || rSong <= 0 || rSong >= 1) return 1;

    const raw = Math.log(rTyp) / Math.log(rSong);
    if (!Number.isFinite(raw)) return 1;
    const clamped = clamp(raw, cfg.gammaClamp[0], cfg.gammaClamp[1]);

    if (cfg.z100Iqr <= 0) return clamped;
    const d = Math.abs(z100 - cfg.z100Median) / cfg.z100Iqr;
    const w = (d * d) / (d * d + 1);
    return 1 + w * (clamped - 1);
  }

  /** Whether V2 parameters are present (mu/sigma/wr, non-degenerate). */
  get hasParams(): boolean {
    return this.a !== null;
  }

  /** Display parameters, or `null` when parameters are missing. */
  get params(): ChartParamsV2 | null {
    if (!this.a) return null;
    const { mu, sigma, z0, z100, gamma, coef, k } = this.a;
    return { mu, sigma, z0, z100, gamma, coef, k };
  }

  /**
   * Single-chart BPI.
   * @returns BPI value (floored). `null` when parameters are missing.
   */
  bpi(exScore: number): number | null {
    if (!this.a) return null;
    const { mu, sigma, m, z0, z100, k } = this.a;
    const z = (tOf(exScore, m) - mu) / sigma;
    const ratio = (z - z0) / (z100 - z0);
    const bpi = 100 * Math.sign(ratio) * Math.pow(Math.abs(ratio), k);
    return Math.max(this.floor, Math.round(bpi * 100) / 100);
  }

  /**
   * EX score required to reach `targetBpi` (for progression graphs).
   * @returns required EX score (0..m). `null` when parameters are missing.
   */
  scoreFor(targetBpi: number): number | null {
    if (!this.a) return null;
    const { mu, sigma, m, z0, z100, k } = this.a;
    const sign = Math.sign(targetBpi) || 1;
    const ratio = Math.pow(Math.abs(targetBpi) / 100, 1 / k);
    const z = z0 + sign * ratio * (z100 - z0);
    const t = mu + sigma * z;
    const s = m - Math.exp(-t);
    if (s > m) return m;
    if (s < 0) return 0;
    return s;
  }

  /** Raw predicted BPI from latent skill `a` (before blending). Used by total BPI. */
  rawFromSkill(a: number): number | null {
    if (!this.a) return null;
    const { z0, z100, k } = this.a;
    const ratio = (a - z0) / (z100 - z0);
    return 100 * Math.sign(ratio) * Math.pow(Math.abs(ratio), k);
  }
}

/** One player bound for V2 computation. Obtain via `model.player(scores)`. */
export class PlayerBpiV2 {
  private readonly aShrunk: number;
  /** Precision-unit information `Σ sigma_j² / σε,j²`. Zero when there are no usable scores. */
  readonly info: number;
  private readonly played: PlayedScoreV2[];

  constructor(
    private readonly model: BpiV2,
    scores: PlayedScoreV2[],
    private readonly cfg: Required<BpiV2Config>,
  ) {
    const globalVar = cfg.residualRmse * cfg.residualRmse;
    let num = 0;
    let info = 0;
    for (const { chart, exScore } of scores) {
      const { mu, sigma, notes } = chart;
      if (mu == null || sigma == null || notes === 0) continue;
      const t = tOf(exScore, notes * 2);
      const ev = chart.residualVar ?? globalVar;
      num += (sigma * (t - mu)) / ev;
      info += (sigma * sigma) / ev;
    }
    this.info = info;
    this.aShrunk = info > 0 ? num / (info + 1) : NaN;
    this.played = scores;
  }

  /** Latent skill `a` (shrunk). `null` when there are no usable scores. */
  get latentSkill(): number | null {
    return this.info > 0 ? this.aShrunk : null;
  }

  /**
   * Predicted BPI for an unplayed chart: the raw prediction from `a`, blended with
   * the floor by confidence `w = info / (info + 1)`.
   */
  predictUnplayed(chart: ChartV2): number | null {
    if (!(this.info > 0)) return null;
    const raw = this.model.chart(chart).rawFromSkill(this.aShrunk);
    if (raw == null) return null;
    const w = this.info / (this.info + 1);
    const blended = w * raw + (1 - w) * this.cfg.bpiFloor;
    return Math.max(this.cfg.bpiFloor, Math.round(blended * 100) / 100);
  }

  /**
   * Total BPI: measured single BPI for played charts, predicted for unplayed charts,
   * aggregated with the shift method.
   * @param unplayedCharts charts this player has not played (with V2 params)
   * @param songCount total chart count; defaults to played + unplayed
   */
  totalBpi(unplayedCharts: ChartV2[], songCount?: number): number | null {
    const bpis: number[] = [];
    for (const { chart, exScore } of this.played) {
      const v = this.model.chart(chart).bpi(exScore);
      if (v !== null) bpis.push(v);
    }
    for (const chart of unplayedCharts) {
      const v = this.predictUnplayed(chart);
      if (v !== null) bpis.push(v);
    }
    if (bpis.length === 0) return null;
    const n = songCount ?? this.played.length + unplayedCharts.length;
    bpis.sort((x, y) => y - x);
    return this.shiftedPowerMean(bpis, n);
  }

  /** Estimated rank within the reference population (empirical curve). `null` when no usable scores. */
  estimatedRank(): number | null {
    return this.info > 0 ? this.model.rankFromSkill(this.aShrunk) : null;
  }

  private shiftedPowerMean(sortedDesc: number[], n: number): number {
    const c = this.cfg.totalBpiShift;
    const kPrime = Math.log(n) / Math.log((100 + c) / (50 + c));
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const bpi = i < sortedDesc.length ? sortedDesc[i] : this.cfg.bpiFloor;
      sum += Math.pow(bpi + c, kPrime) / n;
    }
    return Math.round((Math.pow(sum, 1 / kPrime) - c) * 100) / 100;
  }
}

/** V2 entry point. Bind model constants once, then use `chart(row)` / `player(scores)`. */
export class BpiV2 {
  private readonly cfg: Required<BpiV2Config>;

  constructor(config: BpiV2Config) {
    this.cfg = {
      ...config,
      bpiFloor: config.bpiFloor ?? V2_DEFAULTS.bpiFloor,
      totalBpiShift: config.totalBpiShift ?? V2_DEFAULTS.totalBpiShift,
      gammaClamp: config.gammaClamp ?? V2_DEFAULTS.gammaClamp,
      curveExpClamp: config.curveExpClamp ?? V2_DEFAULTS.curveExpClamp,
      rankBaseSingle: config.rankBaseSingle ?? V2_DEFAULTS.rankBaseSingle,
    };
  }

  /** Whether a chart row is in scope for V2 (has `mu` and `sigma`). */
  hasParams(chart: ChartV2): boolean {
    return chart.mu != null && chart.sigma != null;
  }

  chart(chart: ChartV2): ChartBpiV2 {
    return new ChartBpiV2(chart, this.cfg);
  }

  player(scores: PlayedScoreV2[]): PlayerBpiV2 {
    return new PlayerBpiV2(this, scores, this.cfg);
  }

  /** Single-chart BPI -> estimated rank (same form as V1, base 2616). */
  rankFromSingle(bpi: number): number {
    return Math.max(
      1,
      Math.ceil(Math.pow(this.cfg.rankBaseSingle, (100 - bpi) / 100)),
    );
  }

  /** Latent skill `a` -> estimated rank within the reference population (empirical curve). */
  rankFromSkill(a: number): number {
    const curve = this.cfg.rankCurve;
    const pop = this.cfg.arenaPopulationSize;
    if (curve.length === 0) return pop;
    if (a >= curve[0].a) return 1;
    if (a <= curve[curve.length - 1].a) return pop;

    let lo = 0;
    let hi = curve.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (curve[mid].a > a) lo = mid;
      else hi = mid;
    }
    const [pLo, aLo] = [curve[lo].percentile, curve[lo].a];
    const [pHi, aHi] = [curve[hi].percentile, curve[hi].a];
    const t = aLo === aHi ? 0 : (aLo - a) / (aLo - aHi);
    const percentile = pLo + t * (pHi - pLo);
    return Math.min(pop, Math.max(1, Math.round(percentile * pop)));
  }
}
