"use client";

// Standalone test page for the Modbus P572 RMU controller. Point it at the RMU's
// IP (RTU mode, SW1 = C / 1-9) and watch live registers. This is the in-app proof
// that the product can read the prover over Modbus — the path that replaces PROVEit.

import { useCallback, useRef, useState } from "react";
import { ModbusP572Controller } from "@/lib/piu/modbusController";
import type { P572Reading } from "@/lib/piu/modbus/p572";
import type { PiuStatus } from "@/lib/piu/controller";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_COLOR: Record<PiuStatus, string> = {
  disconnected: "bg-muted-foreground/40",
  connecting: "bg-amber-500 animate-pulse",
  connected: "bg-emerald-500",
  running: "bg-emerald-500 animate-pulse",
  aborting: "bg-amber-500 animate-pulse",
  error: "bg-red-500",
};

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-mono", highlight && "font-semibold text-emerald-600 dark:text-emerald-400")}>
        {value}
      </span>
    </div>
  );
}

export default function PiuModbusPage() {
  const [ip, setIp] = useState("10.255.255.255");
  const [unitId, setUnitId] = useState(1);
  const [status, setStatus] = useState<PiuStatus>("disconnected");
  const [reading, setReading] = useState<P572Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrlRef = useRef<ModbusP572Controller | null>(null);

  const isConnected = status === "connected" || status === "running";

  const handleConnect = useCallback(async () => {
    setError(null);
    const ctrl = new ModbusP572Controller({ ip: ip.trim(), unitId, pollMs: 1000 });
    ctrlRef.current = ctrl;
    ctrl.onStatus(setStatus);
    ctrl.onReading(setReading);
    try {
      await ctrl.connect();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ip, unitId]);

  const handleDisconnect = useCallback(async () => {
    await ctrlRef.current?.disconnect();
    setStatus("disconnected");
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">PIU — Modbus (Newflow P572 RMU)</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        RMU must be in <strong>RTU mode</strong> (front-panel SW1 = C, or 1–9). Enter its IP
        (find it with MicroConf, or the direct-connect fallback <code>10.255.255.255</code>) and
        Connect. Reads over Modbus/TCP via <code>/api/piu/modbus</code>.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">RMU IP</span>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            disabled={isConnected}
            className="w-44 rounded border bg-background px-2 py-1 font-mono text-sm disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Unit / addr</span>
          <input
            type="number"
            min={1}
            max={9}
            value={unitId}
            onChange={(e) => setUnitId(Number(e.target.value))}
            disabled={isConnected}
            className="w-20 rounded border bg-background px-2 py-1 font-mono text-sm disabled:opacity-50"
          />
        </label>
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_COLOR[status])} aria-hidden />
          <span className="capitalize">{status}</span>
        </div>
        <div className="ml-auto">
          {isConnected ? (
            <Button size="sm" variant="destructive" onClick={handleDisconnect}>
              Disconnect
            </Button>
          ) : (
            <Button size="sm" onClick={handleConnect}>
              Connect
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 whitespace-pre-line rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Error:</strong> {error}
          <div className="mt-1 text-xs opacity-80">
            Check: RMU is in RTU mode (SW1) and power-cycled, the IP is right, the Ethernet link
            is up, and the unit address matches SW1.
          </div>
        </div>
      )}

      {reading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-lg border p-4 text-sm">
            <h2 className="mb-2 font-medium">Frequencies & analog inputs</h2>
            <Row label="Freq A (Hz)" value={reading.freqA.toFixed(3)} highlight />
            <Row label="Freq B (Hz)" value={reading.freqB.toFixed(3)} />
            <Row label="Freq C / RAWIN (Hz)" value={reading.freqC.toFixed(3)} />
            {reading.anInMa.map((ma, i) => (
              <Row key={i} label={`AnIn${i + 1} (mA)`} value={ma.toFixed(4)} />
            ))}
          </section>

          <section className="rounded-lg border p-4 text-sm">
            <h2 className="mb-2 font-medium">Prover & status</h2>
            <Row label="Prover state" value={`${reading.proverStatus} — ${reading.proverStateText}`} highlight />
            <Row label="Detector (DI9)" value={reading.detectorClosed ? "CLOSED" : "open"} highlight={reading.detectorClosed} />
            <Row label="Digital inputs" value={`0x${reading.digitalInputs.toString(16).padStart(3, "0")}`} />
            <Row label="SW1-2 pulse count" value={String(reading.proverPulseSw1Sw2)} />
            <Row label="Good pulse count" value={String(reading.goodPulseCount)} />
            <Row label="System status" value={`0x${reading.systemStatus.toString(16).padStart(2, "0")}`} />
            <Row label="Msg Id (2 Hz tick)" value={String(reading.messageId)} />
          </section>
        </div>
      ) : (
        <p className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
          {isConnected ? "Polling…" : "Not connected. Enter the RMU IP and click Connect."}
        </p>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        The <strong>Msg Id</strong> field should tick up ~2×/sec when the RMU is healthy — a quick
        liveness check. AnIn1–4 are PROVEit Channels 0–3 (typically Meter Temp / Meter Press /
        Prover Temp / Prover Press); apply the 4-20mA scaling to get engineering units.
      </p>
    </main>
  );
}
