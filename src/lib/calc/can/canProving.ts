// Can/tank proving calc — emulates Quorum's Excel "METER TEST PROVING RECORD"
// (Portable.xlsx) line-for-line, so results tie out to the existing worksheets.
//
//   C avg temp · D CTS (Shelltable lookup) · E CTL @ prover temp · F = A·D·E
//   I CTL @ invoice temp · J = G·I · K = F−J · L = K/J·100 · M = K·231
//   N = F/J (present meter factor) · O present K-factor (input) · P = N·O (new K)
//
// CTL uses the coefficient the sheet hard-codes (K0 = 594.5418, the API 11.1
// jet/kerosene value) for ALL products — exact match to the current sheets.
// Proper per-product CTL (refined/crude/LPG-TP27/ethanol) is a later refinement.

import { ctsFactorAt } from "./ctsTable";

/** Line C — average of the three prover-tank temperatures. */
export function avgProverTemp(temps: Array<number | "">): number {
  const t = temps.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (t.length === 0) return 0;
  return t.reduce((a, b) => a + b, 0) / t.length;
}

/** Line D — CTS metal factor, exact lookup from the embedded Shelltable (round temp, clamp range). */
export function cts(avgTempF: number): number {
  if (!Number.isFinite(avgTempF) || avgTempF === 0) return 0; // sheet returns 0 for an empty run
  return ctsFactorAt(avgTempF);
}

// Lines E / I — CTL exactly per the worksheet formula.
const K0_SHEET = 594.5418;
export function ctlSheet(tempF: number, apiGravity: number): number {
  if (!Number.isFinite(tempF) || tempF === 0) return 0;
  if (tempF === 60) return 1;
  const rho60 = (141.5 / (apiGravity + 131.5)) * 999.016; // kg/m³ at 60°F
  const alpha = K0_SHEET / (rho60 * rho60);
  const dTc = (tempF - 60) / 1.8; // °F delta → °C delta
  return Math.exp(-alpha * dTc * (1 + 0.8 * alpha * dTc));
}

export interface CanRunInput {
  tankReading: number | ""; // A — prover tank gross gallons
  proverTemps: Array<number | "">; // B — top/mid/bot
  meteredAmount: number | ""; // G
  invoiceTempF: number | ""; // H
  apiGravity: number; // product gravity (°API)
  presentKFactor: number | ""; // O — current factor from the meter
}

export interface CanRunResult {
  tankGross: number; // A
  avgTemp: number; // C
  cts: number; // D
  ctlProver: number; // E
  netProver: number; // F
  meterGross: number; // G
  invoiceCtl: number; // I
  netMeter: number; // J
  errorGal: number; // K
  errorPct: number; // L
  cubicInches: number; // M
  meterFactor: number; // N
  presentKFactor: number; // O
  newKFactor: number; // P
}

const n = (v: number | ""): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function canRun(inp: CanRunInput): CanRunResult {
  const A = n(inp.tankReading);
  const G = n(inp.meteredAmount);
  const O = n(inp.presentKFactor);
  const C = avgProverTemp(inp.proverTemps);
  const D = cts(C);
  const E = ctlSheet(C, inp.apiGravity);
  const F = A * D * E;
  const I = ctlSheet(n(inp.invoiceTempF), inp.apiGravity);
  const J = G * I;
  const K = F - J;
  const L = J > 0 ? (K / J) * 100 : 0;
  const M = K * 231;
  const N = F > 0 && J > 0 ? F / J : 0;
  const P = N * O;
  return { tankGross: A, avgTemp: C, cts: D, ctlProver: E, netProver: F, meterGross: G, invoiceCtl: I, netMeter: J, errorGal: K, errorPct: L, cubicInches: M, meterFactor: N, presentKFactor: O, newKFactor: P };
}

// Worksheet repeatability rule (NOTE: confirm semantics — the L1A2 example is an
// adjustment case where N is well off 1.0): two consecutive runs, each meter factor
// in [0.9995, 1.0005], |Δ| ≤ 0.0005, and their average within 0.0010 of the prior factor.
export function canRepeatability(mf1: number, mf2: number, priorFactor?: number) {
  const inBand = (m: number) => m >= 0.9995 && m <= 1.0005;
  const diff = Math.abs(mf1 - mf2);
  const avg = (mf1 + mf2) / 2;
  const priorOk = priorFactor === undefined ? true : Math.abs(avg - priorFactor) <= 0.001;
  return { passed: inBand(mf1) && inBand(mf2) && diff <= 0.0005 && priorOk, avg, diff, bothInBand: inBand(mf1) && inBand(mf2), priorOk };
}
