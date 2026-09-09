# @bpim/bpicalc

BPI (Beat Power Indicator) calculation for beatmania IIDX scores: single-chart BPI,
required-score inversion, total BPI, and rank estimation.

- **V1** — the original / current definition (PGF-based, per-song `coef`).
- **V2** — the distribution-based redefinition (2-parameter latent-ability model, ALS). Experimental.

Zero runtime dependencies. No data is bundled — you pass in the per-chart parameters
and, for V2, the model constants for your data vintage.

## Install

```sh
pnpm add @bpim/bpicalc
# npm i @bpim/bpicalc   /   yarn add @bpim/bpicalc
```

## Quick start

### V1

```ts
import { BpiV1 } from "@bpim/bpicalc";

const v1 = new BpiV1();

const chart = { notes: 1500, kaidenAvg: 2700, wrScore: 2960, coef: 1.0 };

v1.chart(chart).bpi(2890);          // single-chart BPI
v1.chart(chart).scoreFor(90);       // EX score needed for BPI 90
v1.chart(chart).scoreFor(90, false);// same, unrounded

v1.total([92, 71, 60, 44, -15], 650); // total BPI over 650 charts (missing filled with -15)
v1.rankFromTotal(78);                  // estimated rank from total BPI
v1.rankFromSingle(78);                 // estimated rank from a single-chart BPI
```

Bind a chart once and reuse it for many scores:

```ts
const c = v1.chart(chart);
scores.map((s) => c.bpi(s));
```

### V2

```ts
import { BpiV2 } from "@bpim/bpicalc";

// One set of constants per data vintage (from your params file / model table).
const v2 = new BpiV2({
  z0: -0.1938,
  zRef: 1.9481,
  z100Median: 6.5164,
  z100Iqr: 1.1916,
  residualRmse: 0.3012,
  coefMedian: 0.949,
  arenaPopulationSize: 4867,
  rankCurve: [ /* { percentile, a } ..., ascending percentile */ ],
});

// A chart row carries the ALS parameters (mu / sigma / residualVar) plus notes / wr / coef.
const chart = {
  notes: 1500, kaidenAvg: 2700, wrScore: 2960, coef: 0.9,
  mu: -3.1, sigma: 0.42, residualVar: 0.09,
};

v2.hasParams(chart);            // false if mu / sigma are missing
v2.chart(chart).bpi(2890);     // single-chart BPI (exactly 100 at the WR score)
v2.chart(chart).scoreFor(90);  // EX score needed for BPI 90
v2.chart(chart).params;        // { mu, sigma, z0, z100, gamma, coef, k }

// Player-level: bind the player's scores once.
const played = [{ chart, exScore: 2890 }, /* ... */];
const p = v2.player(played);

p.latentSkill;                       // shrunk latent skill a  (null if no usable scores)
p.info;                              // precision-unit information
p.predictUnplayed(someChart);        // predicted BPI for a chart the player hasn't touched
p.totalBpi(unplayedCharts);          // total BPI (measured + predicted, shift-method aggregate)
p.estimatedRank();                   // estimated rank within the reference population
```

## Data source

`@bpim/bpicalc` never reads a file. Supply the numbers from wherever you keep them:

| value | today (bpim2) | later |
| --- | --- | --- |
| `notes`, `kaidenAvg`, `wrScore`, `coef` | `songDef` row | `songDef` row |
| `mu`, `sigma`, `residualVar` (V2) | `songParams.json` lookup, merged onto the row | `songDef` row |
| `BpiV2Config` (`z0`, `zRef`, …) | `songParams.json` top-level | model config table |

When the ALS parameters move into `songDef`, a `songDef` row *is* a `ChartV2` — pass it straight through.

## API

### `new BpiV1(config?)`

| method | returns |
| --- | --- |
| `chart(row)` | `ChartBpiV1` — `.bpi(exScore)`, `.scoreFor(targetBpi, ceiled?)`, `.exponent` |
| `total(bpis, count)` | total BPI (signed power mean) |
| `totalBpiExponent(count)` | `max(1, log2(count))` |
| `rankFromTotal(totalBpi)` / `rankFromSingle(bpi)` | estimated rank |

`config` (all optional, override the defaults in `V1_DEFAULTS`):
`defaultPowCoef` (1.175), `rankBaseTotal` (2699), `rankBaseSingle` (2616).

### `new BpiV2(config)`

| method | returns |
| --- | --- |
| `hasParams(row)` | `boolean` |
| `chart(row)` | `ChartBpiV2` — `.bpi(exScore)`, `.scoreFor(targetBpi)`, `.params`, `.hasParams` |
| `player(scores)` | `PlayerBpiV2` — `.latentSkill`, `.info`, `.predictUnplayed(row)`, `.totalBpi(unplayed, count?)`, `.estimatedRank()` |
| `rankFromSingle(bpi)` / `rankFromSkill(a)` | estimated rank |

`config` — required: `z0`, `zRef`, `z100Median`, `z100Iqr`, `residualRmse`, `coefMedian`,
`rankCurve`, `arenaPopulationSize`. Optional (override the defaults in `V2_DEFAULTS`):
`bpiFloor` (-15), `totalBpiShift` (15), `gammaClamp` (`[0.3, 3]`),
`curveExpClamp` (`[0.62, 3]`), `rankBaseSingle` (2616).

`bpi(exScore)` / `scoreFor(...)` / `params` return `null` when the chart has no V2 parameters.
`latentSkill` / `estimatedRank()` return `null` when the player has no usable scores.

## Develop

```sh
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm build       # tsup -> dist/ (ESM + CJS + d.ts)
```

## License

MIT
