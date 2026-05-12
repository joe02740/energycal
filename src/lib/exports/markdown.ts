import type { ExportPayload } from "./types";

const f = (n: number | null | undefined, d = 4) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);

export function renderMarkdown(p: ExportPayload): string {
  const r = p.result;
  const passes = r.passes
    .map(
      (pass) =>
        `| ${pass.passNumber} | ${pass.isWetDown ? "wet-down" : pass.excluded ? "excluded" : "ok"} | ${f(pass.imf, 5)} | ${f(pass.gsvp, 4)} | ${f(pass.isvm, 4)} | ${f(pass.ivm, 4)} | ${f(pass.ccfMeter, 6)} | ${f(pass.ccfProver, 6)} |`,
    )
    .join("\n");

  return `# Meter Proving Certificate

**Customer:** ${p.customer.name}
**Location:** ${p.location.name}${p.location.address ? ` — ${p.location.address}` : ""}
**Date:** ${new Date(p.generatedAt).toLocaleString()}

**Technician:** ${p.contacts.techName}${p.contacts.techCompany ? ` (${p.contacts.techCompany})` : ""}
**Witness:** ${p.contacts.witnessName ?? "—"}${p.contacts.witnessCompany ? ` (${p.contacts.witnessCompany})` : ""}

---

## Meter
- **Tag:** ${p.meter.tag}${p.meter.description ? ` — ${p.meter.description}` : ""}
- **Manufacturer / Model / Serial:** ${[p.meter.manufacturer, p.meter.model, p.meter.serialNumber].filter(Boolean).join(" / ") || "—"}
- **Nominal K-factor:** ${p.meter.nominalKFactor} pulses/gal${p.meter.sizeIn ? ` · ${p.meter.sizeIn}″` : ""}

## Prover
- **Tag:** ${p.prover.tag}${p.prover.material ? ` (${p.prover.material})` : ""}
- **Manufacturer / Model / Serial:** ${[p.prover.manufacturer, p.prover.model, p.prover.serialNumber].filter(Boolean).join(" / ") || "—"}
- **Base volume:** ${p.prover.baseVolume} ${p.prover.baseVolumeUnit}
- **Pipe ID / Wall:** ${p.prover.pipeInternalDiameterIn ?? "—"}″ / ${p.prover.pipeWallThicknessIn ?? "—"}″

## Product & Conditions
- **Product:** ${p.product.name}${p.product.productType ? ` (${p.product.productType})` : ""}
- **Density:** ${p.conditions.densityApi} °API @ ${p.conditions.densityTempF}°F
- **EVP:** ${p.conditions.evpPsig} psig
- **Hydrometer correction:** ${p.conditions.hydrometerCorrection ? "Yes" : "No"}

## Acceptance
- **Profile:** ${p.acceptance.name}
- **Repeatability tolerance:** ±${p.acceptance.repeatabilityTolerancePct}%
- **Consistency:** ${p.acceptance.consistencyRunsRequired} of ${p.acceptance.consistencyRunsMax}

---

## Per-pass

| # | Status | IMF | GSVp | ISVm | IVm | CCFm | CCFp |
|---|---|---|---|---|---|---|---|
${passes}

## Result

| Field | Value |
|---|---|
| **MF** | **${f(r.mf, 4)}** |
| CMF | ${f(r.cmf, 4)} |
| MA | ${f(r.ma, 4)} |
| KF | ${f(r.kf, 1)} |
| Repeatability | ${f(r.repeatabilityPct, 3)}% |
| ρ_60 | ${r.rho60KgM3.toFixed(2)} kg/m³ |
| **Result** | **${r.passed ? "✅ PASS" : "❌ FAIL"}** |

### Run-averaged corrections

| Side | CTL | CPL | CTS | CPS | CCF |
|---|---|---|---|---|---|
| Meter  | ${f(r.ctlMeter, 6)} | ${f(r.cplMeter, 6)} | — | — | ${f(r.ccfMeter, 6)} |
| Prover | ${f(r.ctlProver, 6)} | ${f(r.cplProver, 6)} | ${f(r.ctsProver, 6)} | ${f(r.cpsProver, 6)} | ${f(r.ccfProver, 6)} |

${r.warnings.length ? `\n## Warnings\n\n${r.warnings.map((w) => `- ${w}`).join("\n")}\n` : ""}

---

*Energy Cal · ${p.appVersion ?? "v0"}${p.shortHash ? ` · hash ${p.shortHash}` : ""}*
`;
}
