"use client";

// Live proving control panel in the wizard. Connects to the prover — either over
// the proprietary PIU protocol (RS-232 via serial bridge) or Modbus/TCP — and
// auto-fills Tp/Pp/Tm/Pm (and pulses, once the PIU pulse field is mapped) into the
// pass rows. Both controllers implement PiuController, so the live readout + capture
// share one path via the PiuLiveSample stream.

import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Plug, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  getPiuController,
  setPiuController,
  type PiuController,
  type PiuLiveSample,
  type PiuStatus,
} from "@/lib/piu/controller";
import { PiuRs232Controller } from "@/lib/piu/piuRs232Controller";
import { ModbusP572Controller } from "@/lib/piu/modbusController";
import type { AnalogInput } from "@/lib/piu/piuRs232/decode";
import { useWizardStore, type WizardPass } from "@/lib/wizard/store";
import type { Prover } from "@/lib/data/types";

type Transport = "piu" | "modbus";

const STATUS_LABEL: Record<PiuStatus, string> = {
  disconnected: "Disconnected", connecting: "Connecting…", connected: "Connected",
  running: "Capturing…", aborting: "Stopping…", error: "Error",
};
const STATUS_COLOR: Record<PiuStatus, string> = {
  disconnected: "bg-muted-foreground/40", connecting: "bg-amber-500 animate-pulse",
  connected: "bg-emerald-500", running: "bg-emerald-500 animate-pulse",
  aborting: "bg-amber-500 animate-pulse", error: "bg-red-500",
};

function loadSavedAnalog(): AnalogInput[] | undefined {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("piu-analog-config") : null;
    return raw ? (JSON.parse(raw) as AnalogInput[]) : undefined;
  } catch { return undefined; }
}

export function PiuControlPanel({ prover }: { prover: Prover | null }) {
  const [transport, setTransport] = useState<Transport>("piu");
  const [ip, setIp] = useState("10.255.255.255");
  const [status, setStatus] = useState<PiuStatus>("disconnected");
  const [sample, setSample] = useState<PiuLiveSample | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const ctrlRef = useRef<PiuController | null>(null);
  const sampleRef = useRef<PiuLiveSample | null>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("rmu-ip");
      if (saved) setIp(saved);
    }
  }, []);

  const teardown = useCallback(() => {
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    ctrlRef.current?.disconnect();
    ctrlRef.current = null;
  }, []);
  useEffect(() => () => teardown(), [teardown]);

  const isConnected = status === "connected" || status === "running";

  const onConnect = async () => {
    if (isConnected) { teardown(); setStatus("disconnected"); setSample(null); return; }
    setMessage(null);
    const ctrl: PiuController =
      transport === "piu"
        ? new PiuRs232Controller({ analog: loadSavedAnalog() })
        : new ModbusP572Controller({ ip: ip.trim(), channelMap: undefined });
    if (transport === "modbus" && typeof window !== "undefined") window.localStorage.setItem("rmu-ip", ip.trim());
    ctrlRef.current = ctrl;
    setPiuController(ctrl);
    unsubsRef.current = [
      ctrl.onStatus(setStatus),
      ctrl.subscribe((s) => { sampleRef.current = s; setSample(s); }),
    ];
    try { await ctrl.connect(); } catch (e) { setMessage(e instanceof Error ? e.message : "Connect failed"); }
  };

  // Snapshot the current live values into the next empty pass row.
  const capturePass = () => {
    const s = sampleRef.current;
    const store = useWizardStore.getState();
    const target = store.passes.find((p) => p.pulses === "");
    if (!target) { setMessage("All pass rows are filled — add a row to capture more."); return; }
    const r1 = (v?: number) => (v === undefined ? undefined : Math.round(v * 10) / 10);
    const r2 = (v?: number) => (v === undefined ? undefined : Math.round(v * 100) / 100);
    const patch: Partial<WizardPass> = {};
    if (s?.proverTempF !== undefined) patch.proverTempF = r1(s.proverTempF);
    if (s?.proverPressurePsig !== undefined) patch.proverPressurePsig = r2(s.proverPressurePsig);
    if (s?.meterTempF !== undefined) patch.meterTempF = r1(s.meterTempF);
    if (s?.meterPressurePsig !== undefined) patch.meterPressurePsig = r2(s.meterPressurePsig);
    if (s?.pulses !== undefined) patch.pulses = s.pulses;
    store.updatePass(target.passNumber, patch);
    setMessage(
      patch.pulses !== undefined
        ? `✓ Captured pass ${target.passNumber} — ${patch.pulses} pulses`
        : `✓ Captured Tp/Pp/Tm/Pm into pass ${target.passNumber} — enter pulses (pulse capture lands after the next prove-run mapping)`,
    );
  };

  // keep the panel in sync if the global controller was set elsewhere
  useEffect(() => {
    if (!ctrlRef.current) setStatus(getPiuController().status);
  }, []);

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span className={cn("inline-block h-2 w-2 rounded-full", STATUS_COLOR[status])} aria-hidden />
          <span className="font-medium">{STATUS_LABEL[status]}</span>
          <span className="text-muted-foreground">
            · {transport === "piu" ? "PIU RS-232" : "Modbus/TCP"}{prover ? ` · ${prover.tag}` : ""}
          </span>
        </div>
        <div className="flex overflow-hidden rounded-md border text-xs">
          <button onClick={() => !isConnected && setTransport("piu")} disabled={isConnected}
            className={cn("px-2 py-1", transport === "piu" ? "bg-primary text-primary-foreground" : "bg-background")}>
            PIU (RS-232)
          </button>
          <button onClick={() => !isConnected && setTransport("modbus")} disabled={isConnected}
            className={cn("border-l px-2 py-1", transport === "modbus" ? "bg-primary text-primary-foreground" : "bg-background")}>
            Modbus
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {transport === "modbus" && (
          <div className="grid gap-1">
            <Label htmlFor="rmuIp" className="text-xs">RMU IP</Label>
            <Input id="rmuIp" value={ip} onChange={(e) => setIp(e.target.value)} disabled={isConnected} className="w-40 font-mono text-sm" />
          </div>
        )}
        <Button size="sm" variant={isConnected ? "destructive" : "default"} onClick={onConnect}
          disabled={status === "connecting" || status === "aborting"}>
          <Plug className="mr-1.5 h-3.5 w-3.5" />{isConnected ? "Disconnect" : "Connect"}
        </Button>
        {isConnected && (
          <Button size="sm" onClick={capturePass}>
            <Play className="mr-1.5 h-3.5 w-3.5" /> Capture pass
          </Button>
        )}
      </div>

      {transport === "piu" && !isConnected && (
        <p className="mt-2 text-xs text-muted-foreground">
          Start the serial bridge first: <code>node serial-bridge/bridge.js COM6 9600</code> (close PROVEit so the port is free).
          Scaling uses the Analog Config you saved on <code>/piu-serial</code>.
        </p>
      )}

      {isConnected && sample && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 rounded border bg-background/60 p-2 font-mono text-xs">
          <span className="flex items-center gap-1"><Activity className="h-3 w-3 text-emerald-500" />live</span>
          {sample.proverTempF !== undefined && <span>Tp {sample.proverTempF.toFixed(1)}°F</span>}
          {sample.proverPressurePsig !== undefined && <span>Pp {sample.proverPressurePsig.toFixed(2)} psig</span>}
          {sample.meterTempF !== undefined && <span>Tm {sample.meterTempF.toFixed(1)}°F</span>}
          {sample.meterPressurePsig !== undefined && <span>Pm {sample.meterPressurePsig.toFixed(2)} psig</span>}
          {sample.frequencyHz !== undefined && <span>Freq {sample.frequencyHz.toFixed(2)} Hz</span>}
          {sample.pulses !== undefined && <span className="font-semibold text-emerald-600 dark:text-emerald-400">Pulses {sample.pulses}</span>}
        </div>
      )}

      {message && <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">{message}</p>}
    </div>
  );
}
