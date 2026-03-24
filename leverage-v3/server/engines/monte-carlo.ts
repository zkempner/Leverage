// Monte Carlo Simulation Engine — converts deterministic point estimates
// into probability distributions. Uses triangular distributions parameterized
// per lever type. Pure TypeScript, no external libraries.
// N=10,000 iterations. Outputs p10/p50/p90 for savings and NPV,
// broken down by initiative and by phase.

// ========================================================================
// Interfaces
// ========================================================================

export interface MonteCarloResult {
  engagement_id: number;
  n_iterations: number;

  // Portfolio-level percentiles
  total_savings_p10: number;
  total_savings_p50: number;
  total_savings_p90: number;
  npv_p10: number;
  npv_p50: number;
  npv_p90: number;

  // Per-initiative breakdown
  by_initiative: InitiativeDistribution[];

  // Per-phase breakdown
  by_phase: Record<string, PhaseDistribution>;

  // Metadata
  discount_rate: number;
  ran_at: string;
}

export interface InitiativeDistribution {
  initiative_id: number;
  initiative_name: string;
  lever_type: string;
  phase: string;
  savings_p10: number;
  savings_p50: number;
  savings_p90: number;
  npv_p10: number;
  npv_p50: number;
  npv_p90: number;
}

export interface PhaseDistribution {
  phase: string;
  initiative_count: number;
  savings_p10: number;
  savings_p50: number;
  savings_p90: number;
  npv_p10: number;
  npv_p50: number;
  npv_p90: number;
}

// Input interfaces (what callers pass in)
interface InitiativeInput {
  id: number;
  name: string;
  lever_type: string;
  category_name: string;
  target_amount: number;      // Deterministic point estimate from sizing engine
  addressable_spend: number;  // Category addressable spend
  phase: string;              // quick_win | medium_term | long_term
}

interface EngagementInput {
  id: number;
  discount_rate: number;      // e.g. 0.10 for 10%
}

// ========================================================================
// Triangular Distribution Parameters by Lever Type
// ========================================================================

// Each lever has: savings_rate (low/mid/high), addressable_pct (low/mid/high)
// These represent the range of outcomes seen across PE engagements.
// Sources: Hackett Group CPO Agenda 2024, A&M Performance Improvement Practice,
//          McKinsey Procurement Practice, ISM benchmarks.

interface TriParams {
  savings_rate: { low: number; mid: number; high: number };
  addressable_pct: { low: number; mid: number; high: number };
}

const LEVER_TRI_PARAMS: Record<string, TriParams> = {
  renegotiation: {
    savings_rate:   { low: 0.04, mid: 0.07, high: 0.12 },
    addressable_pct: { low: 0.50, mid: 0.70, high: 0.85 },
  },
  volume_consolidation: {
    savings_rate:   { low: 0.07, mid: 0.12, high: 0.18 },
    addressable_pct: { low: 0.40, mid: 0.60, high: 0.75 },
  },
  contract_term_optimization: {
    savings_rate:   { low: 0.03, mid: 0.05, high: 0.08 },
    addressable_pct: { low: 0.35, mid: 0.50, high: 0.65 },
  },
  demand_reduction: {
    savings_rate:   { low: 0.08, mid: 0.15, high: 0.22 },
    addressable_pct: { low: 0.25, mid: 0.40, high: 0.55 },
  },
  process_efficiency: {
    savings_rate:   { low: 0.05, mid: 0.08, high: 0.13 },
    addressable_pct: { low: 0.35, mid: 0.50, high: 0.65 },
  },
  spec_change: {
    savings_rate:   { low: 0.07, mid: 0.12, high: 0.18 },
    addressable_pct: { low: 0.20, mid: 0.30, high: 0.45 },
  },
  make_vs_buy: {
    savings_rate:   { low: 0.08, mid: 0.15, high: 0.25 },
    addressable_pct: { low: 0.25, mid: 0.40, high: 0.55 },
  },
  spend_under_management: {
    savings_rate:   { low: 0.04, mid: 0.08, high: 0.12 },
    addressable_pct: { low: 0.35, mid: 0.50, high: 0.65 },
  },
  payment_terms: {
    savings_rate:   { low: 0.01, mid: 0.03, high: 0.05 },
    addressable_pct: { low: 0.40, mid: 0.60, high: 0.80 },
  },
  payment_term_optimization: {
    savings_rate:   { low: 0.01, mid: 0.03, high: 0.05 },
    addressable_pct: { low: 0.40, mid: 0.60, high: 0.80 },
  },
  global_sourcing: {
    savings_rate:   { low: 0.10, mid: 0.15, high: 0.22 },
    addressable_pct: { low: 0.20, mid: 0.35, high: 0.50 },
  },
  competitive_bidding: {
    savings_rate:   { low: 0.05, mid: 0.10, high: 0.15 },
    addressable_pct: { low: 0.40, mid: 0.60, high: 0.75 },
  },
};

const DEFAULT_TRI_PARAMS: TriParams = {
  savings_rate:   { low: 0.04, mid: 0.08, high: 0.14 },
  addressable_pct: { low: 0.30, mid: 0.50, high: 0.70 },
};

// CTA as % of Year 1 savings (total across all CTA components)
// Mirrors CTA_TABLE in financial-model.ts but expressed as totals for sampling
const CTA_TOTAL_PCT: Record<string, number> = {
  volume_consolidation:       0.16,  // 5+2+8+1
  renegotiation:              0.11,  // 8+0+3+0
  contract_term_optimization: 0.11,  // 3+5+2+1
  demand_reduction:           0.23,  // 5+10+3+5
  process_efficiency:         0.31,  // 8+15+5+3
  spec_change:                0.26,  // 10+5+8+3
  make_vs_buy:                0.45,  // 5+20+15+5
  spend_under_management:     0.15,  // 3+8+2+2
  payment_terms:              0.06,  // 2+3+1+0
  payment_term_optimization:  0.06,
  global_sourcing:            0.26,  // 8+5+10+3
  competitive_bidding:        0.11,  // 6+2+3+0
};

const DEFAULT_CTA_PCT = 0.17;

// Ramp curves: cumulative realization fractions at [month3, month6, month12, year2, year3]
const RAMP_TABLE: Record<string, number[]> = {
  renegotiation:              [0.10, 0.30, 0.70, 0.90, 1.00],
  volume_consolidation:       [0.05, 0.15, 0.50, 0.80, 1.00],
  contract_term_optimization: [0.15, 0.40, 0.75, 0.95, 1.00],
  demand_reduction:           [0.10, 0.25, 0.55, 0.80, 1.00],
  process_efficiency:         [0.05, 0.10, 0.40, 0.70, 0.95],
  spec_change:                [0.00, 0.05, 0.25, 0.60, 0.90],
  make_vs_buy:                [0.00, 0.00, 0.15, 0.50, 0.85],
  spend_under_management:     [0.10, 0.30, 0.65, 0.85, 1.00],
  payment_terms:              [0.20, 0.60, 0.90, 1.00, 1.00],
  payment_term_optimization:  [0.20, 0.60, 0.90, 1.00, 1.00],
  global_sourcing:            [0.00, 0.05, 0.30, 0.65, 0.90],
  competitive_bidding:        [0.10, 0.35, 0.70, 0.90, 1.00],
};

const DEFAULT_RAMP = [0.05, 0.20, 0.50, 0.80, 1.00];

// ========================================================================
// Deterministic PRNG (Mulberry32) — reproducible simulations
// ========================================================================

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ========================================================================
// Triangular Distribution Sampler
// ========================================================================

// Inverse CDF method: given uniform U in [0,1], return sample from Tri(low, mid, high)
function triangularSample(low: number, mid: number, high: number, u: number): number {
  if (high <= low) return mid;
  const fc = (mid - low) / (high - low);
  if (u < fc) {
    return low + Math.sqrt(u * (high - low) * (mid - low));
  } else {
    return high - Math.sqrt((1 - u) * (high - low) * (high - mid));
  }
}

// ========================================================================
// NPV Calculation (3-year horizon)
// ========================================================================

// Given annual savings and a ramp curve, compute 3-year NPV.
// Ramp: [month3, month6, month12, year2, year3] cumulative fractions.
// Year 1 savings = annualSavings × ramp[2] (month12 cumulative).
// Year 2 incremental = annualSavings × (ramp[3] - ramp[2]).
// Year 3 incremental = annualSavings × (ramp[4] - ramp[3]).
// CTA cost is subtracted from year 0.
function computeNpv(
  annualSavings: number,
  ctaCost: number,
  ramp: number[],
  discountRate: number,
): number {
  const yr1 = annualSavings * ramp[2];
  const yr2 = annualSavings * ramp[3];
  const yr3 = annualSavings * ramp[4];

  const npv =
    -ctaCost +
    yr1 / (1 + discountRate) +
    yr2 / Math.pow(1 + discountRate, 2) +
    yr3 / Math.pow(1 + discountRate, 3);

  return npv;
}

// ========================================================================
// Percentile Extraction
// ========================================================================

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ========================================================================
// Main Engine
// ========================================================================

const N_ITERATIONS = 10_000;
const DEFAULT_SEED = 42;

export function runMonteCarlo(
  initiatives: InitiativeInput[],
  engagement: EngagementInput,
  seed: number = DEFAULT_SEED,
): MonteCarloResult {
  const rand = mulberry32(seed);
  const n = initiatives.length;

  if (n === 0) {
    return emptyResult(engagement);
  }

  // Pre-resolve lever params for each initiative
  const leverParams = initiatives.map(init => {
    const lt = init.lever_type.toLowerCase().trim();
    const tri = LEVER_TRI_PARAMS[lt] || DEFAULT_TRI_PARAMS;
    const ctaBasePct = CTA_TOTAL_PCT[lt] ?? DEFAULT_CTA_PCT;
    const ramp = RAMP_TABLE[lt] || DEFAULT_RAMP;
    return { tri, ctaBasePct, ramp };
  });

  // Storage: per-initiative savings and NPV arrays
  const initSavings: number[][] = initiatives.map(() => []);
  const initNpv: number[][] = initiatives.map(() => []);
  const totalSavings: number[] = [];
  const totalNpv: number[] = [];

  const dr = engagement.discount_rate;

  // --- Run iterations ---
  for (let iter = 0; iter < N_ITERATIONS; iter++) {
    let iterTotalSavings = 0;
    let iterTotalNpv = 0;

    for (let i = 0; i < n; i++) {
      const init = initiatives[i];
      const { tri, ctaBasePct, ramp } = leverParams[i];

      // Sample savings_rate from triangular distribution
      const sampledRate = triangularSample(
        tri.savings_rate.low, tri.savings_rate.mid, tri.savings_rate.high,
        rand(),
      );

      // Sample addressable_pct from triangular distribution
      const sampledAddr = triangularSample(
        tri.addressable_pct.low, tri.addressable_pct.mid, tri.addressable_pct.high,
        rand(),
      );

      // Compute annual savings for this iteration
      const annualSavings = init.addressable_spend * sampledAddr * sampledRate;

      // Sample CTA: triangular around base ±25%
      const ctaLow = ctaBasePct * 0.75;
      const ctaHigh = ctaBasePct * 1.25;
      const sampledCtaPct = triangularSample(ctaLow, ctaBasePct, ctaHigh, rand());
      const ctaCost = annualSavings * sampledCtaPct;

      // Sample realization timing: perturb ramp ±10%
      const rampJitter = triangularSample(0.90, 1.00, 1.10, rand());
      const perturbedRamp = ramp.map(r => Math.min(1.0, r * rampJitter));

      // NPV with perturbed ramp
      const npv = computeNpv(annualSavings, ctaCost, perturbedRamp, dr);

      initSavings[i].push(annualSavings);
      initNpv[i].push(npv);

      iterTotalSavings += annualSavings;
      iterTotalNpv += npv;
    }

    totalSavings.push(iterTotalSavings);
    totalNpv.push(iterTotalNpv);
  }

  // --- Sort and extract percentiles ---
  totalSavings.sort((a, b) => a - b);
  totalNpv.sort((a, b) => a - b);

  const byInitiative: InitiativeDistribution[] = initiatives.map((init, i) => {
    const sv = initSavings[i].slice().sort((a, b) => a - b);
    const nv = initNpv[i].slice().sort((a, b) => a - b);
    return {
      initiative_id: init.id,
      initiative_name: init.name,
      lever_type: init.lever_type,
      phase: init.phase,
      savings_p10: Math.round(percentile(sv, 10)),
      savings_p50: Math.round(percentile(sv, 50)),
      savings_p90: Math.round(percentile(sv, 90)),
      npv_p10: Math.round(percentile(nv, 10)),
      npv_p50: Math.round(percentile(nv, 50)),
      npv_p90: Math.round(percentile(nv, 90)),
    };
  });

  // --- Phase aggregation ---
  const phaseMap: Record<string, { ids: number[]; savings: number[][]; npv: number[][] }> = {};
  for (let i = 0; i < n; i++) {
    const phase = initiatives[i].phase || "medium_term";
    if (!phaseMap[phase]) {
      phaseMap[phase] = { ids: [], savings: [], npv: [] };
    }
    phaseMap[phase].ids.push(i);
    phaseMap[phase].savings.push(initSavings[i]);
    phaseMap[phase].npv.push(initNpv[i]);
  }

  const byPhase: Record<string, PhaseDistribution> = {};
  for (const [phase, data] of Object.entries(phaseMap)) {
    // Sum per-iteration across initiatives in this phase
    const phaseSavings: number[] = [];
    const phaseNpv: number[] = [];
    for (let iter = 0; iter < N_ITERATIONS; iter++) {
      let s = 0;
      let npv = 0;
      for (let j = 0; j < data.savings.length; j++) {
        s += data.savings[j][iter];
        npv += data.npv[j][iter];
      }
      phaseSavings.push(s);
      phaseNpv.push(npv);
    }
    phaseSavings.sort((a, b) => a - b);
    phaseNpv.sort((a, b) => a - b);

    byPhase[phase] = {
      phase,
      initiative_count: data.ids.length,
      savings_p10: Math.round(percentile(phaseSavings, 10)),
      savings_p50: Math.round(percentile(phaseSavings, 50)),
      savings_p90: Math.round(percentile(phaseSavings, 90)),
      npv_p10: Math.round(percentile(phaseNpv, 10)),
      npv_p50: Math.round(percentile(phaseNpv, 50)),
      npv_p90: Math.round(percentile(phaseNpv, 90)),
    };
  }

  return {
    engagement_id: engagement.id,
    n_iterations: N_ITERATIONS,
    total_savings_p10: Math.round(percentile(totalSavings, 10)),
    total_savings_p50: Math.round(percentile(totalSavings, 50)),
    total_savings_p90: Math.round(percentile(totalSavings, 90)),
    npv_p10: Math.round(percentile(totalNpv, 10)),
    npv_p50: Math.round(percentile(totalNpv, 50)),
    npv_p90: Math.round(percentile(totalNpv, 90)),
    by_initiative: byInitiative,
    by_phase: byPhase,
    discount_rate: engagement.discount_rate,
    ran_at: new Date().toISOString(),
  };
}

// ========================================================================
// Empty result helper
// ========================================================================

function emptyResult(engagement: EngagementInput): MonteCarloResult {
  return {
    engagement_id: engagement.id,
    n_iterations: N_ITERATIONS,
    total_savings_p10: 0,
    total_savings_p50: 0,
    total_savings_p90: 0,
    npv_p10: 0,
    npv_p50: 0,
    npv_p90: 0,
    by_initiative: [],
    by_phase: {},
    discount_rate: engagement.discount_rate,
    ran_at: new Date().toISOString(),
  };
}
