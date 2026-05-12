// Volume-impact analytics — the customer-value story, expressed in product units only.
// Mirrors the math from C:\Project\Quorum\Calibration\nh_rbob_impact.py
// but without the dollar conversion: petroleum operators read gallons fluently
// and the price assumption was the part most likely to start an argument.
//
// For each consecutive pair of provings on a meter:
//   daysBetween   = days(visit_n+1, visit_n)
//   drift         = |MF_n+1 - MF_n|
//   gallonsAtRisk = (throughput / nMeters) × daysBetween × drift
//
// "Unregistered product" is intentionally neutral: the gap could be over- or
// under-registration. Either direction is a measurement gap worth tightening.

import type { ProvingRecord } from "@/lib/data/types";

export interface ImpactInputs {
  throughputGalDay: number;
  /** How throughput is split across the meters at this site. Default: divide evenly. */
  meterCount?: number;
}

export interface IntervalImpact {
  meterId: string;
  fromDate: string;
  toDate: string;
  days: number;
  driftAbs: number;       // unsigned MF delta
  gallonsAtRisk: number;
  endingMf: number;
}

export interface ImpactSummary {
  totalGallons: number;
  intervals: IntervalImpact[];
  startDate: string | null;
  endDate: string | null;
  meterCount: number;
}

export function impactForCustomer(
  provings: ProvingRecord[],
  inputs: ImpactInputs,
): ImpactSummary {
  const byMeter = new Map<string, ProvingRecord[]>();
  for (const p of provings) {
    if (!byMeter.has(p.meterId)) byMeter.set(p.meterId, []);
    byMeter.get(p.meterId)!.push(p);
  }
  for (const arr of byMeter.values()) {
    arr.sort((a, b) => a.datePerformed.localeCompare(b.datePerformed));
  }

  const meterCount = inputs.meterCount ?? Math.max(byMeter.size, 1);
  const perMeterThroughput = inputs.throughputGalDay / meterCount;

  const intervals: IntervalImpact[] = [];
  for (const [meterId, history] of byMeter) {
    const valid = history.filter((p) => p.mf != null && p.mf !== 0);
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i - 1];
      const cur = valid[i];
      const days = daysBetween(prev.datePerformed, cur.datePerformed);
      if (days <= 0) continue;
      const drift = Math.abs((cur.mf ?? 0) - (prev.mf ?? 0));
      // Skip absurd drifts (likely first-ever-prove baseline noise).
      if (drift > 0.05) continue;
      const gallons = perMeterThroughput * days * drift;
      intervals.push({
        meterId,
        fromDate: prev.datePerformed,
        toDate: cur.datePerformed,
        days,
        driftAbs: drift,
        gallonsAtRisk: gallons,
        endingMf: cur.mf!,
      });
    }
  }

  const all = provings
    .map((p) => p.datePerformed)
    .filter(Boolean)
    .sort();
  return {
    totalGallons: intervals.reduce((s, i) => s + i.gallonsAtRisk, 0),
    intervals,
    startDate: all[0] ?? null,
    endDate: all[all.length - 1] ?? null,
    meterCount,
  };
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Format a gallon volume. Cold hard numbers: thousands-separator commas at
 * everyday scale, switch to "M gal" at the million mark. No automatic barrel
 * conversion (1 bbl = 42 gal) — operators can do that conversion themselves.
 */
export function formatGallons(n: number): string {
  if (!Number.isFinite(n)) return "0 gal";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M gal`;
  return `${Math.round(n).toLocaleString()} gal`;
}
