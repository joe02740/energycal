// Auto-mapping from source column headers → canonical TargetField names.
// Hand-curated synonyms cover FieldApps, Energy Cal native, and common
// PROVEit-shape exports. Unknown columns stay unmapped; the user can wire
// them up by hand in the UI.

import type { ColumnMapping, TargetField } from "./types";

// Lowercased synonyms; normalized form strips spaces, dashes, underscores, dots.
function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_\-.]+/g, "");
}

const SYNONYMS: Record<TargetField, string[]> = {
  task_id:                ["taskid", "task"],
  date_performed:         ["dateperformed", "date", "datetime", "performedat", "datestamp", "datetime", "timestamp"],
  username:               ["username", "user", "tech", "technician", "operator"],
  status:                 ["status", "state"],
  reason:                 ["reason"],
  customer_name:          ["customer", "customername", "customerlabel"],
  location_name:          ["location", "locationname", "fieldlocationname", "fieldlocation", "site"],
  meter_id:               ["meterid", "meterindex"],
  meter_name:             ["metername", "metertag", "tag", "name"],
  meter_serial:           ["meterserial", "serial", "serialnumber"],
  meter_model:            ["metermodel", "model"],
  nominal_k_factor:       ["nominalkfactor", "kfactor", "kfactornominal", "k", "nominalkfactorppg", "kfactorpulsesgal"],
  product_name:           ["product", "productname"],
  density:                ["density", "obsdensity", "observeddensity", "rhoobs"],
  density_temp_f:         ["densitytemp", "densitytempf", "obsdensitytemp", "observedtemp"],
  base_density:           ["basedensity", "rho60", "densitybase"],
  prover_name:            ["provername", "prover", "provertag"],
  prover_serial:          ["proverserial", "proverserialnumber"],
  mf:                     ["mf", "meterfactor", "meterfactorthisrun"],
  cmf:                    ["cmf", "compositemeterfactor"],
  ma:                     ["ma", "meteraccuracy"],
  kf:                     ["kf"],
  ckf:                    ["ckf", "compositekf"],
  repeatability_pct:      ["repeatabilitypct", "repeatability", "repeatpct"],
  uncertainty_pct:        ["uncertaintypct", "uncertainty"],
  prior_deviation_pct:    ["priordeviationpct", "priordev", "deviationprev", "deviation"],
  prior_deviation_passed: ["priordeviationpassed", "deviationpassed", "priordevpassed"],
  passed:                 ["passed", "result", "outcome"],
  ctlm:                   ["ctlm", "ctlmeter"],
  ctlp:                   ["ctlp", "ctlprover"],
  cplm:                   ["cplm", "cplmeter"],
  cplp:                   ["cplp", "cplprover"],
  ccfm:                   ["ccfm", "ccfmeter"],
  ccfp:                   ["ccfp", "ccfprover"],
  avg_flow_rate:          ["avgflowrate", "avgflow", "averageflowrate", "flowrate"],
};

const TARGETS: TargetField[] = Object.keys(SYNONYMS) as TargetField[];

const REQUIRED_FIELDS: TargetField[] = [
  "date_performed",
  "meter_name",
  "mf",
];

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  // Two passes: exact match first, then synonym match.
  for (const target of TARGETS) {
    const synonyms = SYNONYMS[target];
    for (const h of headers) {
      if (used.has(h)) continue;
      if (norm(h) === target.replace(/_/g, "")) {
        mapping[target] = h;
        used.add(h);
        break;
      }
    }
    if (mapping[target]) continue;
    for (const h of headers) {
      if (used.has(h)) continue;
      const n = norm(h);
      if (synonyms.includes(n)) {
        mapping[target] = h;
        used.add(h);
        break;
      }
    }
  }

  return mapping;
}

export function listMappableTargets(): TargetField[] {
  return [...TARGETS];
}

export function isRequired(target: TargetField): boolean {
  return REQUIRED_FIELDS.includes(target);
}

export function getRequiredFields(): TargetField[] {
  return [...REQUIRED_FIELDS];
}

export function findMissingRequired(mapping: ColumnMapping): TargetField[] {
  return REQUIRED_FIELDS.filter((f) => !mapping[f]);
}
