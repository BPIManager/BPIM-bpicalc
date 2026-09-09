import { describe, expect, it } from "vitest";
import { BpiV1 } from "../src/index";

const v1 = new BpiV1();
const song = { notes: 1500, kaidenAvg: 2700, wrScore: 2960, coef: 1.0 };
const m = song.notes * 2;

describe("BpiV1.chart(row).bpi", () => {
  it("is ~0 at kaiden average and ~100 at WR", () => {
    const c = v1.chart(song);
    expect(Math.abs(c.bpi(song.kaidenAvg)!)).toBeLessThan(0.01);
    expect(c.bpi(song.wrScore)).toBeCloseTo(100, 5);
  });

  it("increases monotonically with score", () => {
    const c = v1.chart(song);
    let prev = -Infinity;
    for (let s = 0; s <= m; s += 50) {
      const b = c.bpi(s)!;
      expect(b).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = b;
    }
  });

  it("floors at -15 and returns null past the theoretical max", () => {
    const c = v1.chart(song);
    expect(c.bpi(0)).toBe(-15);
    expect(c.bpi(-100)).toBe(-15);
    expect(c.bpi(m + 1)).toBeNull();
  });

  it("returns -15 when anchors are missing", () => {
    expect(v1.chart({ ...song, kaidenAvg: null }).bpi(2000)).toBe(-15);
    expect(v1.chart({ ...song, notes: 0 }).bpi(2000)).toBe(-15);
  });
});

describe("BpiV1.chart(row).scoreFor", () => {
  it("round-trips with bpi()", () => {
    const c = v1.chart(song);
    for (const target of [10, 30, 55, 80, 95]) {
      const s = c.scoreFor(target, false);
      expect(c.bpi(s)).toBeCloseTo(target, 1);
    }
  });
});

describe("BpiV1 total / rank", () => {
  it("one WR + rest unplayed approaches 50", () => {
    expect(v1.total([100], 650)).toBeGreaterThan(49);
    expect(v1.total([100], 650)).toBeLessThan(51);
  });

  it("rankFromTotal is 1 at 100 and decreases with BPI", () => {
    expect(v1.rankFromTotal(100)).toBe(1);
    expect(v1.rankFromTotal(50)).toBeGreaterThan(v1.rankFromTotal(80));
  });

  it("rankFromSingle is 1 at 100", () => {
    expect(v1.rankFromSingle(100)).toBe(1);
    expect(v1.rankFromSingle(50)).toBeGreaterThan(v1.rankFromSingle(90));
  });
});

describe("BpiV1 config override", () => {
  it("uses defaults when nothing is passed", () => {
    const noCoef = { ...song, coef: undefined };
    expect(v1.chart(noCoef).exponent).toBe(1.175);
  });

  it("honours defaultPowCoef and rank bases", () => {
    const custom = new BpiV1({
      defaultPowCoef: 2,
      rankBaseTotal: 1000,
      rankBaseSingle: 1000,
    });
    const noCoef = { ...song, coef: undefined };
    expect(custom.chart(noCoef).exponent).toBe(2);
    expect(custom.chart(noCoef).bpi(2800)).not.toBe(v1.chart(noCoef).bpi(2800));
    expect(custom.rankFromTotal(0)).toBe(1000);
  });
});
