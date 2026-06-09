"use client";

// Live prover view over the proprietary PIU protocol (RS-232) + an editable Analog
// Config (PROVEit's Zero/Span/Offset model) so readings can be scaled/trimmed to the
// real transmitter. Reserved slots for frequency/pulses/runs light up once mapped.

import { useCallback, useEffect, useRef, useState } from "react";
import { PiuRs232Controller } from "@/lib/piu/piuRs232Controller";
import { DEFAULT_ANALOG, type AnalogInput, type AnalogSource, type PiuReading } from "@/lib/piu/piuRs232/decode";
import type { PiuStatus } from "@/lib/piu/controller";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<PiuStatus, string> = {
  disconnected: "bg-muted-foreground/40",
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-emerald-500",
  running: "bg-emerald-500 animate-pulse",
  aborting: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
};
const SOURCES: AnalogSource[] = ["Tp", "Pp", "Tm", "Pm", "none"];
const LS_KEY = "piu-analog-config";

function Metric({ label, value, unit, big }: { label: string; value: string; unit: string; big?: boolean }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("font-mono tabular-nums", big ? "text-3xl font-semibold" : "text-xl")}>
        {value} <span className="text-sm font-normal text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export default function PiuSerialPage() {
  const [status, setStatus] = useState<PiuStatus>("disconnected");
  const [reading, setReading] = useState<PiuReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analog, setAnalog] = useState<AnalogInput[]>(DEFAULT_ANALOG);
  const ctrlRef = useRef<PiuRs232Controller | null>(null);

  // Load saved scaling once.
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(LS_KEY) : null;
      if (raw) setAnalog(JSON.parse(raw) as AnalogInput[]);
    } catch { /* ignore */ }
  }, []);

  const isConnected = status === "connected" || status === "running";

  const applyAnalog = useCallback((next: AnalogInput[]) => {
    setAnalog(next);
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    ctrlRef.current?.setAnalogScaling(next);
  }, []);

  const editRow = (i: number, patch: Partial<AnalogInput>) => {
    applyAnalog(analog.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  };

  const handleConnect = useCallback(async () => {
    setError(null);
    const ctrl = new PiuRs232Controller({ analog });
    ctrlRef.current = ctrl;
    ctrl.onStatus(setStatus);
    ctrl.onReading(setReading);
    try { await ctrl.connect(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [analog]);

  const handleDisconnect = useCallback(async () => {
    await ctrlRef.current?.disconnect();
    setStatus("disconnected");
  }, []);

  const num = (v: string): number => (v === "" || !Number.isFinite(Number(v)) ? 0 : Number(v));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">PIU — direct over RS-232 (Newflow RMU)</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Reads the prover over the reverse-engineered PIU protocol — no PROVEit, no Ethernet, no mode
        switch. Temp &amp; pressure decoded; scaling is editable below (PROVEit&apos;s Analog-Config model).
      </p>

      <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-800 dark:bg-blue-950/30">
        <p className="mb-1 font-medium text-blue-900 dark:text-blue-100">Start the serial bridge first (one terminal):</p>
        <pre className="rounded bg-black/80 p-2 text-green-400">{`cd serial-bridge
node bridge.js COM6 9600`}</pre>
        <p className="mt-1 text-blue-700 dark:text-blue-300">Leave it running, then Connect. (Close PROVEit so the port is free.)</p>
      </div>

      <div className="mb-5 flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_COLOR[status])} aria-hidden />
          <span className="capitalize">{status}</span>
        </div>
        <div className="ml-auto">
          {isConnected ? <Button size="sm" variant="destructive" onClick={handleDisconnect}>Disconnect</Button>
            : <Button size="sm" onClick={handleConnect}>Connect</Button>}
        </div>
      </div>

      {error && (
        <div className="mb-5 whitespace-pre-line rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Error:</strong> {error}
        </div>
      )}

      {reading && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric label="Prover Temp (Tp)" value={reading.Tp?.toFixed(1) ?? "—"} unit="°F" big />
            <Metric label="Prover Press (Pp)" value={reading.Pp?.toFixed(2) ?? "—"} unit="psig" big />
            <Metric label="Meter Temp (Tm)" value={reading.Tm?.toFixed(1) ?? "—"} unit="°F" />
            <Metric label="Meter Press (Pm)" value={reading.Pm?.toFixed(2) ?? "—"} unit="psig" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-xs sm:grid-cols-6">
            {reading.channelMa.map((ma, i) => (
              <div key={i} className="rounded border p-2 text-center">
                <div className="text-muted-foreground">Ch{i}</div>
                <div>{ma.toFixed(3)} mA</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Analog config — PROVEit's Zero/Span/Offset model */}
      <section className="mt-6 rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Analog Config</h2>
          <Button size="sm" variant="ghost" onClick={() => applyAnalog(DEFAULT_ANALOG)}>Reset to PROVEit defaults</Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          eng = Zero + (mA−4)/16 × (Span−Zero) + Offset. Edit Zero/Span to the transmitter&apos;s real
          range, or Offset to trim. Changes apply live and are saved on this device.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1 pr-2">Source</th><th className="px-2">Ch</th>
                <th className="px-2">Zero</th><th className="px-2">Span</th><th className="px-2">Offset</th><th className="px-2">Unit</th>
              </tr>
            </thead>
            <tbody>
              {analog.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">
                    <select value={r.source} onChange={(e) => editRow(i, { source: e.target.value as AnalogSource })}
                      className="rounded border bg-background px-1.5 py-1 text-sm">
                      {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-2"><Input type="number" min={0} max={5} value={r.channel} className="h-8 w-14"
                    onChange={(e) => editRow(i, { channel: Math.max(0, Math.min(5, num(e.target.value))) })} /></td>
                  <td className="px-2"><Input type="number" step="any" value={r.zero} className="h-8 w-20" onChange={(e) => editRow(i, { zero: num(e.target.value) })} /></td>
                  <td className="px-2"><Input type="number" step="any" value={r.span} className="h-8 w-20" onChange={(e) => editRow(i, { span: num(e.target.value) })} /></td>
                  <td className="px-2"><Input type="number" step="any" value={r.offset} className="h-8 w-20" onChange={(e) => editRow(i, { offset: num(e.target.value) })} /></td>
                  <td className="px-2"><Input value={r.unit} className="h-8 w-16" onChange={(e) => editRow(i, { unit: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          To read true temp: set the Temp rows&apos; Zero/Span to the transmitter&apos;s range (≈ 50–200°F
          on this unit) and watch the tile match the box. Frequency, pulses &amp; run/launch slot in
          here once captured from a real prove — no rework.
        </p>
      </section>
    </main>
  );
}
