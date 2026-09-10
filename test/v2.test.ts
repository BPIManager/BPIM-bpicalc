import { describe, expect, it } from "vitest";
import { BpiV2, type BpiV2Config, type ChartV2 } from "../src/index";

const config: BpiV2Config = {
  z0: -0.2,
  zRef: 1.95,
  z100Median: 6.5,
  z100Iqr: 1.2,
  residualRmse: 0.3,
  coefMedian: 0.95,
  arenaPopulationSize: 4867,
  rankCurve: [
    { percentile: 0.0, a: 3.0 },
    { percentile: 0.25, a: 1.5 },
    { percentile: 0.5, a: 0.5 },
    { percentile: 0.75, a: -0.3 },
    { percentile: 1.0, a: -1.2 },
  ],
};

const v2 = new BpiV2(config);

const chart: ChartV2 = {
  notes: 1500,
  kaidenAvg: 2700,
  wrScore: 2999, // t ~ 0 -> z100 ~ 6.0
  coef: 0.9,
  mu: -3.0,
  sigma: 0.5,
  residualVar: 0.2,
};
const m = chart.notes * 2;

describe("BpiV2.chart(row)", () => {
  it("is exactly 100 at the WR score", () => {
    expect(v2.chart(chart).bpi(chart.wrScore!)).toBe(100);
  });

  it("increases monotonically and floors at -15", () => {
    const c = v2.chart(chart);
    let prev = -Infinity;
    for (let s = 0; s <= m; s += 50) {
      const b = c.bpi(s)!;
      expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = b;
    }
    expect(c.bpi(0)).toBe(-15);
  });

  it("exposes params with k = clamp(gamma * coef, 0.62, 3)", () => {
    const p = v2.chart(chart).params!;
    expect(p.z0).toBe(config.z0);
    expect(p.z100).toBeCloseTo(6.0, 1);
    expect(p.k).toBeCloseTo(Math.max(0.62, Math.min(3, p.gamma * p.coef)), 10);
  });

  it("round-trips scoreFor with bpi", () => {
    const c = v2.chart(chart);
    for (const target of [20, 45, 70, 90]) {
      expect(c.bpi(c.scoreFor(target)!)).toBeCloseTo(target, 1);
    }
  });

  it("is out of scope without mu/sigma", () => {
    const noMu = { ...chart, mu: null };
    expect(v2.hasParams(noMu)).toBe(false);
    expect(v2.chart(noMu).hasParams).toBe(false);
    expect(v2.chart(noMu).bpi(2000)).toBeNull();
    expect(v2.chart(noMu).params).toBeNull();
  });
});

describe("BpiV2.player(scores)", () => {
  it("latentSkill rises with score and is null with no usable scores", () => {
    const strong = v2.player([{ chart, exScore: 2990 }]).latentSkill!;
    const weak = v2.player([{ chart, exScore: 2400 }]).latentSkill!;
    expect(strong).toBeGreaterThan(weak);
    expect(v2.player([]).latentSkill).toBeNull();
  });

  it("totalBpi returns a finite number in a sane range", () => {
    const played = [{ chart, exScore: 2990 }];
    const scoped = [
      { chart, exScore: 2990 },
      ...Array.from({ length: 20 }, () => ({ chart })),
    ];
    const t = v2.player(played).totalBpi(scoped)!;
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(-15);
    expect(t).toBeLessThanOrEqual(100);
  });

  it("totalBpi uses measured BPI where an exScore is given", () => {
    // Every scoped chart carries a score -> the aggregate is a pure function of
    // the per-chart BPIs, independent of latent skill.
    const scoped = [2990, 2900, 2800].map((exScore) => ({ chart, exScore }));
    const p = v2.player([{ chart, exScore: 2990 }]);
    const bpis = scoped
      .map(({ exScore }) => v2.chart(chart).bpi(exScore)!)
      .sort((a, b) => b - a);
    const c = 15;
    const kPrime = Math.log(scoped.length) / Math.log((100 + c) / (50 + c));
    const expected =
      Math.round(
        (Math.pow(
          bpis.reduce((s, b) => s + Math.pow(b + c, kPrime) / scoped.length, 0),
          1 / kPrime,
        ) -
          c) *
          100,
      ) / 100;
    expect(p.totalBpi(scoped)).toBeCloseTo(expected, 10);
  });

  it("counts exScore-less entries as predicted (above the floor for a strong player)", () => {
    const played = [{ chart, exScore: 2990 }];
    const withUnplayed = v2.player(played).totalBpi([
      { chart, exScore: 2990 },
      { chart },
      { chart },
    ])!;
    // Same denominator (3); the two unplayed entries contribute predicted BPIs
    // rather than the -15 fill a bare measured list would get.
    const playedOnly = v2.player(played).totalBpi([{ chart, exScore: 2990 }], 3)!;
    expect(withUnplayed).toBeGreaterThan(playedOnly);
  });

  it("estimatedRank decreases as skill rises", () => {
    const strong = v2.player([{ chart, exScore: 2995 }]).estimatedRank()!;
    const weak = v2.player([{ chart, exScore: 2500 }]).estimatedRank()!;
    expect(strong).toBeLessThan(weak);
  });
});

describe("BpiV2 rank helpers", () => {
  it("rankFromSkill clamps at the curve ends and is monotone", () => {
    expect(v2.rankFromSkill(10)).toBe(1);
    expect(v2.rankFromSkill(-10)).toBe(config.arenaPopulationSize);
    expect(v2.rankFromSkill(2.0)).toBeLessThan(v2.rankFromSkill(0.0));
  });

  it("rankFromSingle is 1 at 100", () => {
    expect(v2.rankFromSingle(100)).toBe(1);
    expect(v2.rankFromSingle(40)).toBeGreaterThan(v2.rankFromSingle(80));
  });
});

describe("BpiV2 config override", () => {
  it("honours a custom bpiFloor", () => {
    const floored = new BpiV2({ ...config, bpiFloor: -30 });
    expect(floored.chart(chart).bpi(0)).toBe(-30);
  });
});
