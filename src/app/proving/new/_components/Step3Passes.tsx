"use client";

import {
  MAX_PASSES,
  useWizardStore,
  type WizardPass,
} from "@/lib/wizard/store";
import type { Meter, Prover } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eraser, Plus, Radio, Trash2 } from "lucide-react";
import { PiuControlPanel } from "./PiuControlPanel";

export function Step3Passes({
  meter,
  prover,
}: {
  meter: Meter | null;
  prover: Prover | null;
}) {
  const wiz = useWizardStore();
  const filledPasses = wiz.passes.filter(
    (p) => typeof p.pulses === "number" && p.pulses > 0,
  ).length;

  // Wet-down only applies to can/tank provers (the can has to be wetted before
  // a real run; the first pass is excluded from repeatability per ASTM/API).
  // Bidirectional ball provers self-wet at low flow before "go", so it's not
  // captured per pass for ball/SVP — match the Bay 1 Arm 1 spreadsheet behavior.
  const isCanProver =
    prover?.proverType === "tank_can_open_neck" ||
    prover?.proverType === "master_meter";

  // For v0: no PIU connection yet; the table is manual entry but the framing
  // is set up so v1 can stream pulses from the prover/meter and auto-fill rows.
  const isLiveModeAvailable = false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>Passes</span>
          <Badge variant="secondary" className="font-normal">
            <Radio className="mr-1 h-3 w-3" />
            Live mode {isLiveModeAvailable ? "available" : "(v1 — PIU streaming)"}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {meter && prover ? (
            <>
              Proving <span className="font-medium">{meter.tag}</span> with{" "}
              <span className="font-medium">{prover.tag}</span>. Pulse mode{" "}
              <span className="font-medium">{meter.pulseMode}</span> · K ={" "}
              <span className="font-medium">{meter.nominalKFactor}</span> pulses/gal.{" "}
              In v1, pulse counts will stream from the {prover.piuCommType ?? "PIU"} connection
              and per-pass MF/repeatability will populate as each pass completes; the live
              sidebar will recalculate in real time. For v0, enter values manually.
            </>
          ) : (
            "Select a meter and prover first."
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <PiuControlPanel prover={prover} />
        </div>
        <div className="mb-4 flex items-end gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="passCount" className="text-xs">
              # of passes ({filledPasses} filled, {wiz.passes.length} rows, max {MAX_PASSES})
            </Label>
            <Input
              id="passCount"
              type="number"
              min={1}
              max={MAX_PASSES}
              step={1}
              value={wiz.passes.length}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) wiz.setPassCount(n);
              }}
              className="w-24"
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => wiz.addPass()}
            disabled={wiz.passes.length >= MAX_PASSES}
          >
            <Plus className="mr-2 h-4 w-4" /> Add row
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-2 py-2 font-medium">Pass</th>
                <th className="px-2 py-2 font-medium">Pulses</th>
                <th className="px-2 py-2 font-medium">Tp °F</th>
                <th className="px-2 py-2 font-medium">Pp psig</th>
                <th className="px-2 py-2 font-medium">Tm °F</th>
                <th className="px-2 py-2 font-medium">Pm psig</th>
                {isCanProver && (
                  <th className="px-2 py-2 font-medium">Wet-down</th>
                )}
                <th className="px-2 py-2 font-medium">Excluded</th>
                <th className="px-2 py-2 font-medium"></th>
                <th className="px-2 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {wiz.passes.map((p) => (
                <PassRow key={p.passNumber} pass={p} isCanProver={isCanProver} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-between">
          <Button variant="secondary" onClick={wiz.prev}>
            Back
          </Button>
          <Button onClick={wiz.next} disabled={filledPasses < 2}>
            Next ({filledPasses < 2 ? "need ≥2 filled passes" : "Review"})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PassRow({
  pass,
  isCanProver,
}: {
  pass: WizardPass;
  isCanProver: boolean;
}) {
  const wiz = useWizardStore();
  const update = (patch: Partial<WizardPass>) => wiz.updatePass(pass.passNumber, patch);
  const hasData =
    pass.pulses !== "" ||
    pass.proverTempF !== "" ||
    pass.proverPressurePsig !== "" ||
    pass.meterTempF !== "" ||
    pass.meterPressurePsig !== "";

  const num = (v: string) => {
    if (v === "") return "" as const;
    const n = Number(v);
    return Number.isFinite(n) ? n : ("" as const);
  };

  return (
    <tr className={pass.excluded || pass.isWetDown ? "opacity-60" : undefined}>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          <span className="font-medium">{pass.passNumber}</span>
          {pass.isWetDown ? <Badge variant="secondary">wet-down</Badge> : null}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={pass.pulses}
          onChange={(e) => update({ pulses: num(e.target.value) })}
          className="w-28"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={pass.proverTempF}
          onChange={(e) => update({ proverTempF: num(e.target.value) })}
          className="w-20"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={pass.proverPressurePsig}
          onChange={(e) => update({ proverPressurePsig: num(e.target.value) })}
          className="w-20"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={pass.meterTempF}
          onChange={(e) => update({ meterTempF: num(e.target.value) })}
          className="w-20"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          inputMode="decimal"
          step="any"
          value={pass.meterPressurePsig}
          onChange={(e) => update({ meterPressurePsig: num(e.target.value) })}
          className="w-20"
        />
      </td>
      {isCanProver && (
        <td className="px-2 py-1.5 text-center">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={pass.isWetDown}
            onChange={(e) => update({ isWetDown: e.target.checked })}
          />
        </td>
      )}
      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={pass.excluded}
          onChange={(e) => update({ excluded: e.target.checked })}
        />
      </td>
      <td className="px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => wiz.discardPass(pass.passNumber)}
          disabled={!hasData}
          title="Discard this run's data (keeps the row)"
        >
          <Eraser className="h-4 w-4" />
        </Button>
      </td>
      <td className="px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => wiz.removePass(pass.passNumber)}
          disabled={wiz.passes.length <= 1}
          title="Remove this row entirely"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}
