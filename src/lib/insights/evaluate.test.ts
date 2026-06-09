import { describe, expect, it } from "vitest";
import { deriveMaturity, evaluate } from "./evaluate";
import type { ProvingObservation, PopulationStats, Rule } from "./types";

const emptyPop: PopulationStats = { totalProvings: 0, byMeterModel: {} };

function obs(
  partial: Partial<ProvingObservation> & { mf: number; date: string },
): ProvingObservation {
  return {
    meterId: "m1",
    productId: "p1",
    datePerformed: new Date(partial.date),
    cmf: null,
    repeatabilityPct: 0.02,
    priorDeviationPct: null,
    passed: true,
    isWetDown: false,
    excluded: false,
    ...partial,
  };
}

describe("deriveMaturity", () => {
  it("establishing when below threshold", () => {
    const m = deriveMaturity(
      [obs({ mf: 1.0, date: "2026-01-01" }), obs({ mf: 1.0, date: "2026-02-01" })],
      5,
      "m1",
    );
    expect(m.baselineStatus).toBe("establishing");
    expect(m.provingsToBaseline).toBe(3);
  });

  it("developing when between threshold and 2× threshold", () => {
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 6; i++) {
      history.push(obs({ mf: 1.0, date: `2026-${String(i + 1).padStart(2, "0")}-01` }));
    }
    expect(deriveMaturity(history, 5, "m1").baselineStatus).toBe("developing");
  });

  it("established at 2× threshold or more", () => {
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 12; i++) {
      history.push(obs({ mf: 1.0, date: `2026-${String((i % 12) + 1).padStart(2, "0")}-01` }));
    }
    expect(deriveMaturity(history, 5, "m1").baselineStatus).toBe("established");
  });

  it("wet-down + excluded passes don't count", () => {
    const history = [
      obs({ mf: 1.0, date: "2026-01-01", isWetDown: true }),
      obs({ mf: 1.0, date: "2026-02-01", excluded: true }),
      obs({ mf: 1.0, date: "2026-03-01" }),
    ];
    expect(deriveMaturity(history, 2, "m1").qualifyingObservations).toBe(1);
  });
});

describe("evaluate — suppression dial", () => {
  // Always-fires rule for testing the dial behavior.
  const noisyRule: Rule = {
    id: "noisy",
    description: "fires for testing",
    minObservations: 1,
    minPopulationSize: 0,
    evaluate: () => ({
      severity: "watch",
      title: "always fires",
      body: "test",
      recommendation: "test",
      confidence: 90,
    }),
  };

  it("never emits suggestions for an establishing meter", () => {
    const result = evaluate({
      meterId: "m1",
      history: [obs({ mf: 1.0, date: "2026-01-01" })],
      population: emptyPop,
      tenantSuggestionThreshold: 0, // dial all the way down
      minProvingsForBaseline: 5,
      rules: [noisyRule],
    });
    expect(result.maturity.baselineStatus).toBe("establishing");
    expect(result.suggestions).toHaveLength(0);
  });

  it("emits when meter is developing AND rule confidence ≥ tenant threshold", () => {
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 6; i++) {
      history.push(obs({ mf: 1.0, date: `2026-${String(i + 1).padStart(2, "0")}-01` }));
    }
    const result = evaluate({
      meterId: "m1",
      history,
      population: emptyPop,
      tenantSuggestionThreshold: 80,
      minProvingsForBaseline: 5,
      rules: [noisyRule],
    });
    expect(result.maturity.baselineStatus).toBe("developing");
    expect(result.suggestions).toHaveLength(1);
  });

  it("suppresses when tenant threshold > rule confidence", () => {
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 12; i++) {
      history.push(obs({ mf: 1.0, date: `2026-${String((i % 12) + 1).padStart(2, "0")}-01` }));
    }
    const result = evaluate({
      meterId: "m1",
      history,
      population: emptyPop,
      tenantSuggestionThreshold: 95, // above rule's 90
      minProvingsForBaseline: 5,
      rules: [noisyRule],
    });
    expect(result.suggestions).toHaveLength(0);
  });

  it("developing meters only get high-confidence rules even if threshold is low", () => {
    const lowConf: Rule = {
      ...noisyRule,
      id: "lowconf",
      evaluate: () => ({
        severity: "info",
        title: "low",
        body: "x",
        recommendation: "x",
        confidence: 60,
      }),
    };
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 6; i++) {
      history.push(obs({ mf: 1.0, date: `2026-${String(i + 1).padStart(2, "0")}-01` }));
    }
    const result = evaluate({
      meterId: "m1",
      history,
      population: emptyPop,
      tenantSuggestionThreshold: 50,
      minProvingsForBaseline: 5,
      rules: [lowConf],
    });
    // Tenant threshold 50 ≤ rule's 60 → would normally fire.
    // But meter is 'developing' so only ≥ 70 confidence rules pass through.
    expect(result.suggestions).toHaveLength(0);
  });

  it("respects rule's minPopulationSize", () => {
    const popOnly: Rule = {
      ...noisyRule,
      id: "pop",
      minPopulationSize: 100,
    };
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 12; i++) {
      history.push(obs({ mf: 1.0, date: `2026-${String((i % 12) + 1).padStart(2, "0")}-01` }));
    }
    const result = evaluate({
      meterId: "m1",
      history,
      population: { totalProvings: 10, byMeterModel: {} },
      tenantSuggestionThreshold: 50,
      minProvingsForBaseline: 5,
      rules: [popOnly],
    });
    expect(result.suggestions).toHaveLength(0);
  });

  it("v0 default tenant threshold (85) is high enough that built-in rules stay quiet", () => {
    // Smoke test: with default threshold + a reasonable real-shaped history,
    // the built-in rules should not noisily fire. Calibrated by design.
    const history: ProvingObservation[] = [];
    for (let i = 0; i < 8; i++) {
      history.push(
        obs({
          mf: 1.0 + (i % 2 === 0 ? 0.0001 : -0.0001),
          date: `2026-${String(i + 1).padStart(2, "0")}-01`,
          repeatabilityPct: 0.02,
          priorDeviationPct: 0.02,
        }),
      );
    }
    const result = evaluate({
      meterId: "m1",
      meterModel: "Brodie B281",
      history,
      population: { totalProvings: 10, byMeterModel: {} },
      tenantSuggestionThreshold: 85, // production default
      minProvingsForBaseline: 5,
    });
    expect(result.suggestions).toHaveLength(0);
  });
});
