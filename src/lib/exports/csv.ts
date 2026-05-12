import type { ExportPayload } from "./types";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(values: unknown[]): string {
  return values.map(csvEscape).join(",");
}

// One row per proving run. Wide & flat — meant for pivoting in Excel.
export function renderRunCsv(p: ExportPayload): string {
  const r = p.result;
  const headers = [
    "generated_at", "customer", "location", "meter_tag", "meter_serial",
    "prover_tag", "prover_serial", "product",
    "tech", "witness",
    "density_api_60", "density_temp_f", "evp_psig", "hydro_correction",
    "mf", "cmf", "ma", "kf", "ckf",
    "repeatability_pct",
    "ctl_meter", "cpl_meter", "ccf_meter",
    "cts_prover", "cps_prover", "ctl_prover", "cpl_prover", "ccf_prover",
    "ivm_total", "isvm_total", "gsvp_total", "nm",
    "rho_60_kg_m3",
    "passed",
    "repeatability_passed", "consistency_passed",
    "prior_deviation_pct", "prior_passed",
    "historical_deviation_pct", "historical_passed",
    "baseline_deviation_pct", "baseline_passed",
    "warnings",
  ];

  const data = [
    p.generatedAt,
    p.customer.name,
    p.location.name,
    p.meter.tag,
    p.meter.serialNumber ?? "",
    p.prover.tag,
    p.prover.serialNumber ?? "",
    p.product.name,
    p.contacts.techName,
    p.contacts.witnessName ?? "",
    p.conditions.densityApi,
    p.conditions.densityTempF,
    p.conditions.evpPsig,
    p.conditions.hydrometerCorrection,
    r.mf, r.cmf, r.ma, r.kf, r.ckf,
    r.repeatabilityPct,
    r.ctlMeter, r.cplMeter, r.ccfMeter,
    r.ctsProver, r.cpsProver, r.ctlProver, r.cplProver, r.ccfProver,
    r.ivmTotal, r.isvmTotal, r.gsvpTotal, r.nm,
    r.rho60KgM3,
    r.passed,
    r.repeatabilityPassed, r.consistencyPassed,
    r.priorDeviationPct ?? "", r.priorPassed ?? "",
    r.historicalDeviationPct ?? "", r.historicalPassed ?? "",
    r.baselineDeviationPct ?? "", r.baselinePassed ?? "",
    r.warnings.join("; "),
  ];

  return [row(headers), row(data)].join("\n");
}

// One row per pass — for deeper analysis (e.g. per-pass IMF distributions).
export function renderPassCsv(p: ExportPayload): string {
  const headers = [
    "generated_at", "customer", "meter_tag", "prover_tag", "product",
    "pass_number", "is_wet_down", "excluded", "counts_toward_mf",
    "ivm", "isvm", "gsvp", "imf",
    "ctl_meter", "cpl_meter", "ccf_meter",
    "cts_prover", "cps_prover", "ctl_prover", "cpl_prover", "ccf_prover",
  ];
  const lines = [row(headers)];
  for (const pass of p.result.passes) {
    lines.push(
      row([
        p.generatedAt,
        p.customer.name,
        p.meter.tag,
        p.prover.tag,
        p.product.name,
        pass.passNumber,
        pass.isWetDown,
        pass.excluded,
        pass.countsTowardMf,
        pass.ivm,
        pass.isvm,
        pass.gsvp,
        pass.imf,
        pass.ctlMeter,
        pass.cplMeter,
        pass.ccfMeter,
        pass.ctsProver,
        pass.cpsProver,
        pass.ctlProver,
        pass.cplProver,
        pass.ccfProver,
      ]),
    );
  }
  return lines.join("\n");
}
