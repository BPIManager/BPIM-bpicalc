/** V1: original / current BPI (matches bpim2 `BpiCalculator`). */
import { pgf } from "./core";
import type { BpiV1Config, ChartV1 } from "./types";

/** Defaults for {@link BpiV1Config}. Override any of these via the `BpiV1` constructor. */
export const V1_DEFAULTS = {
  defaultPowCoef: 1.175,
  rankBaseTotal: 2699,
  rankBaseSingle: 2616,
} as const;

/** One chart bound for V1 computation. Obtain via `model.chart(row)`. */
export class ChartBpiV1 {
  private readonly powCoef: number;

  constructor(
    private readonly chart: ChartV1,
    defaultPowCoef: number,
  ) {
    const c = chart.coef;
    this.powCoef = c && c > 0 ? c : defaultPowCoef;
  }

  /** Effective exponent for this chart. */
  get exponent(): number {
    return this.powCoef;
  }

  /**
   * Single-chart BPI.
   * @returns BPI value. `-15` if `k`/`z` unset or `notes === 0`; `null` if score exceeds the max.
   */
  bpi(exScore: number): number | null {
    const { notes, kaidenAvg: k, wrScore: z } = this.chart;
    if (k === null || z === null || notes === 0) return -15;
    const m = notes * 2;
    if (exScore > m) return null;
    if (exScore < 0) return -15;

    const _k = pgf(k, m);
    const _s_ = pgf(exScore, m) / _k;
    const _z_ = pgf(z, m) / _k;
    const above = exScore >= k;

    const logS = above ? Math.log(_s_) : -Math.log(_s_);
    const logZ = Math.log(_z_);
    if (Math.abs(logZ) < 0.00001) return 0;

    const res =
      Math.round(
        (above ? 100 : -100) *
          Math.pow(Math.abs(logS / logZ), this.powCoef) *
          100,
      ) / 100;
    return isNaN(res) ? null : Math.max(-15, res);
  }

  /**
   * EX score required to reach `targetBpi`.
   * @param ceiled round up (default) or return the raw value
   * @returns required EX score (0..m). `0` if `k`/`z` unset or `notes === 0`.
   */
  scoreFor(targetBpi: number, ceiled = true): number {
    const { notes, kaidenAvg, wrScore } = this.chart;
    if (kaidenAvg === null || wrScore === null || notes === 0) return 0;
    const m = notes * 2;

    const _k = pgf(kaidenAvg, m);
    const logZ = Math.log(pgf(wrScore, m) / _k);
    const inner =
      (targetBpi >= 0 ? 1 : -1) *
      Math.pow(Math.abs(targetBpi) / 100, 1 / this.powCoef) *
      logZ;
    const _s = _k * Math.exp(inner);
    const res = m * ((_s - 0.5) / _s);

    if (res > m) return m;
    if (res < 0) return 0;
    return ceiled ? Math.ceil(res) : res;
  }
}

/** V1 entry point. Bind model constants once, then use `chart(row)` and the aggregate helpers. */
export class BpiV1 {
  private readonly defaultPowCoef: number;
  private readonly rankBaseTotal: number;
  private readonly rankBaseSingle: number;

  constructor(config: BpiV1Config = {}) {
    this.defaultPowCoef = config.defaultPowCoef ?? V1_DEFAULTS.defaultPowCoef;
    this.rankBaseTotal = config.rankBaseTotal ?? V1_DEFAULTS.rankBaseTotal;
    this.rankBaseSingle = config.rankBaseSingle ?? V1_DEFAULTS.rankBaseSingle;
  }

  chart(chart: ChartV1): ChartBpiV1 {
    return new ChartBpiV1(chart, this.defaultPowCoef);
  }

  /** Power-mean exponent for total BPI: `max(1, log2(n))`. */
  totalBpiExponent(totalSongCount: number): number {
    return Math.max(1, Math.log2(totalSongCount));
  }

  /**
   * Total BPI (signed power mean). Missing charts are filled with -15.
   * @param bpis single-chart BPIs (descending recommended)
   */
  total(bpis: number[], totalSongCount: number): number {
    if (totalSongCount === 0) return -15;
    const k = this.totalBpiExponent(totalSongCount);
    let sum = 0;
    for (let i = 0; i < totalSongCount; i++) {
      const bpi = i < bpis.length ? bpis[i] : -15;
      const m = Math.pow(Math.abs(bpi), k) / totalSongCount;
      sum += bpi > 0 ? m : -m;
    }
    const res = Math.round(Math.pow(Math.abs(sum), 1 / k) * 100) / 100;
    return sum > 0 ? res : -res;
  }

  /** Total BPI -> estimated rank. */
  rankFromTotal(totalBpi: number): number {
    return Math.ceil(Math.pow(this.rankBaseTotal, (100 - totalBpi) / 100));
  }

  /** Single-chart BPI -> estimated rank (base 2616). */
  rankFromSingle(bpi: number): number {
    return Math.max(
      1,
      Math.ceil(Math.pow(this.rankBaseSingle, (100 - bpi) / 100)),
    );
  }
}
