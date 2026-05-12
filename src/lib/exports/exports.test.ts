import { describe, expect, it } from "vitest";
import { runProving } from "@/lib/calc";
import { SPRAGUE_BAY7_DIESEL } from "@/lib/calc/__fixtures__/sprague-bay7-diesel-2026-05-02";
import { renderHtmlCertificate, renderMarkdown, renderPassCsv, renderRunCsv } from ".";
import type { ExportPayload } from "./types";

function buildPayload(): ExportPayload {
  const result = runProving({
    meter: {
      nominalKFactorPulsesPerGal: SPRAGUE_BAY7_DIESEL.meter.nominalKFactorPulsesPerGal,
      mfCalcMethod: SPRAGUE_BAY7_DIESEL.meter.mfCalcMethod,
      trackFactor: SPRAGUE_BAY7_DIESEL.meter.trackFactor,
      kPresent: SPRAGUE_BAY7_DIESEL.meter.nominalKFactorPulsesPerGal,
    },
    prover: {
      bpvBbl: SPRAGUE_BAY7_DIESEL.prover.bpvBbl,
      pipeInternalDiameterIn: SPRAGUE_BAY7_DIESEL.prover.pipeInternalDiameterIn,
      pipeWallThicknessIn: SPRAGUE_BAY7_DIESEL.prover.pipeWallThicknessIn,
      material: SPRAGUE_BAY7_DIESEL.prover.material,
      certifiedTempF: SPRAGUE_BAY7_DIESEL.prover.certifiedTempF,
    },
    product: {
      group: SPRAGUE_BAY7_DIESEL.product.group,
      equilibriumVaporPressurePsig: 0,
      densityType: "observed_rho_obs",
      densityValue: SPRAGUE_BAY7_DIESEL.product.densityApi,
      densityUnit: "api_gravity",
      densityTemperatureF: 60,
    },
    acceptance: {
      evaluationMethod: "repeatability",
      repeatabilityTolerancePct: 0.05,
      consistencyRunsRequired: 3,
      consistencyRunsMax: 3,
      priorDeviationCheck: false,
      priorDeviationMaxPct: null,
      priorDeviationProductDependent: false,
      priorDeviationUseFailedProvings: true,
      priorDeviationUseCutoffDate: false,
      historicalDeviationCheck: false,
      historicalDeviationNPrevious: 0,
      historicalDeviationMaxPct: null,
      baselineDeviationCheck: false,
      baselineDeviationMaxPct: null,
      irvingStyleRepeatability: false,
    },
    passes: SPRAGUE_BAY7_DIESEL.passes.map((p) => ({
      passNumber: p.passNumber,
      isWetDown: false,
      excluded: false,
      pulses: p.pulses,
      proverTempF: p.tpF,
      proverPressurePsig: p.ppPsig,
      meterTempF: p.tmF,
      meterPressurePsig: p.pmPsig,
    })),
  });

  return {
    generatedAt: "2026-05-03T12:00:00.000Z",
    customer: { name: "Sprague" },
    location: { name: "Newington Terminal" },
    meter: {
      tag: "BAY_7_ARM_1",
      manufacturer: "Brodie",
      serialNumber: "17521",
      nominalKFactor: 200,
      sizeIn: 4,
    },
    prover: {
      tag: "QC_3_LARGE",
      manufacturer: "Quorum",
      model: "6\" Ball",
      serialNumber: "QC3",
      baseVolume: 0.955332,
      baseVolumeUnit: "bbl",
      pipeInternalDiameterIn: 6.065,
      pipeWallThicknessIn: 0.28,
      material: "304 Stainless Steel",
    },
    product: { name: "ULSD (#2 Diesel)", productType: "Distillate" },
    acceptance: {
      name: "Custody Transfer Default",
      repeatabilityTolerancePct: 0.05,
      consistencyRunsRequired: 3,
      consistencyRunsMax: 3,
    },
    conditions: {
      densityApi: 35.9,
      densityTempF: 60,
      densityPressurePsig: 0,
      evpPsig: 0,
      hydrometerCorrection: true,
    },
    contacts: {
      techName: "Joseph Barney",
      techCompany: "Quorum Calibration",
      witnessName: "Chad Miller",
      witnessCompany: "Sprague",
    },
    result,
    shortHash: "abcdef012345",
    appVersion: "v0",
  };
}

describe("exports", () => {
  const payload = buildPayload();

  it("Markdown contains MF, customer, meter, witness", () => {
    const md = renderMarkdown(payload);
    expect(md).toContain("Sprague");
    expect(md).toContain("BAY_7_ARM_1");
    expect(md).toContain("Joseph Barney");
    expect(md).toContain("Chad Miller");
    expect(md).toMatch(/MF\s*\*\*\s*\|\s*\*\*1\.0428/);
    expect(md).toContain("PASS");
  });

  it("Run-CSV is one header + one data row, escaping commas safely", () => {
    const csv = renderRunCsv(payload);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    const headers = lines[0].split(",");
    const data = lines[1];
    expect(headers).toContain("mf");
    expect(data).toContain("BAY_7_ARM_1");
    expect(data).toContain("1.0428");
  });

  it("Pass-CSV has one row per pass plus header", () => {
    const csv = renderPassCsv(payload);
    expect(csv.split("\n")).toHaveLength(1 + payload.result.passes.length);
  });

  it("HTML certificate is valid-shaped HTML, includes verdict + headline", () => {
    const html = renderHtmlCertificate(payload);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain("PASS");
    expect(html).toContain("BAY_7_ARM_1");
    expect(html).toContain("hash abcdef012345");
    // Doctype + head + body present
    expect(html).toMatch(/<title>[\s\S]*<\/title>/);
    expect(html).toMatch(/<\/body>\s*<\/html>\s*$/);
  });

  it("HTML escapes meter description with &", () => {
    const p = { ...payload, meter: { ...payload.meter, description: "Loading <Bay> & arm" } };
    const html = renderHtmlCertificate(p);
    expect(html).toContain("Loading &lt;Bay&gt; &amp; arm");
  });
});
