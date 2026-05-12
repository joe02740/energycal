"use client";

import { useWizardStore } from "@/lib/wizard/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function NumberInput({
  id,
  value,
  onChange,
  step = "any",
  placeholder,
}: {
  id: string;
  value: number | "";
  onChange: (v: number | "") => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      placeholder={placeholder}
      value={value === "" ? "" : value}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") return onChange("");
        const n = Number(raw);
        onChange(Number.isFinite(n) ? n : "");
      }}
    />
  );
}

export function Step2Conditions() {
  const wiz = useWizardStore();

  const ready =
    typeof wiz.densityApi === "number" &&
    wiz.densityApi > 0 &&
    typeof wiz.densityTempF === "number" &&
    typeof wiz.evpPsig === "number";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run conditions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="densityApi">Density (°API @60°F)</Label>
          <NumberInput
            id="densityApi"
            value={wiz.densityApi}
            onChange={(v) => wiz.setRunInput("densityApi", v)}
            placeholder="e.g. 35.9"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="densityTempF">Density observed at (°F)</Label>
          <NumberInput
            id="densityTempF"
            value={wiz.densityTempF}
            onChange={(v) => wiz.setRunInput("densityTempF", v)}
            placeholder="60"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="densityPressure">Density observed at (psig)</Label>
          <NumberInput
            id="densityPressure"
            value={wiz.densityPressurePsig}
            onChange={(v) => wiz.setRunInput("densityPressurePsig", v)}
            placeholder="0"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="evp">Equilibrium Vapor Pressure (psig)</Label>
          <NumberInput
            id="evp"
            value={wiz.evpPsig}
            onChange={(v) => wiz.setRunInput("evpPsig", v)}
            placeholder="0 for atmospheric products"
          />
        </div>
        <div className="sm:col-span-2 flex items-center gap-2">
          <input
            id="hydro"
            type="checkbox"
            className="h-4 w-4 rounded border"
            checked={wiz.hydrometerCorrection}
            onChange={(e) => wiz.setHydrometerCorrection(e.target.checked)}
          />
          <Label htmlFor="hydro" className="cursor-pointer">
            Apply hydrometer (glass) correction
          </Label>
        </div>

        <div className="sm:col-span-2 mt-4 flex justify-between">
          <Button variant="secondary" onClick={wiz.prev}>
            Back
          </Button>
          <Button onClick={wiz.next} disabled={!ready}>
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
