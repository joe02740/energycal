"use client";

import { useState } from "react";
import { Calculator, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseDecimal } from "../types";

const CU_IN_PER_GAL = 231; // US gallon, exact

/** Pop-up cubic-inches ↔ gallons converter (231 in³/gal) for can-proving math in the field. */
export function CuInGalCalculator() {
  const [cuIn, setCuIn] = useState("");
  const [gal, setGal] = useState("");

  const onCuIn = (v: string) => {
    setCuIn(v);
    const n = parseDecimal(v);
    setGal(Number.isFinite(n) ? (n / CU_IN_PER_GAL).toFixed(4) : "");
  };
  const onGal = (v: string) => {
    setGal(v);
    const n = parseDecimal(v);
    setCuIn(Number.isFinite(n) ? (n * CU_IN_PER_GAL).toFixed(2) : "");
  };
  const swap = () => {
    setCuIn("");
    setGal("");
  };

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Calculator className="mr-2 h-4 w-4" />
        in³ ↔ gal
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Cubic inches ↔ gallons</DialogTitle>
          <DialogDescription>1 US gallon = 231 in³. Type in either box.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="calc-cuin">Cubic inches</Label>
            <Input
              id="calc-cuin"
              inputMode="decimal"
              value={cuIn}
              onChange={(e) => onCuIn(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex justify-center text-muted-foreground">
            <ArrowRightLeft className="h-4 w-4" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calc-gal">Gallons</Label>
            <Input
              id="calc-gal"
              inputMode="decimal"
              value={gal}
              onChange={(e) => onGal(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">231 in³/gal · 9702 in³/bbl</p>
            <Button variant="ghost" size="sm" onClick={swap}>
              Clear
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
