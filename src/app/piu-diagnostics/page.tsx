"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { WsBridgeController } from "@/lib/piu/wsBridgeController";
import type { PiuStatus } from "@/lib/piu/controller";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BAUD_OPTIONS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

const STATUS_COLOR: Record<PiuStatus, string> = {
  disconnected: "bg-muted-foreground/40",
  connecting:   "bg-amber-500 animate-pulse",
  connected:    "bg-emerald-500",
  running:      "bg-emerald-500 animate-pulse",
  aborting:     "bg-amber-500 animate-pulse",
  error:        "bg-red-500",
};

const QUICK_COMMANDS = [
  { label: "CR",    value: "\r",    desc: "Carriage return" },
  { label: "CR+LF", value: "\r\n", desc: "CRLF" },
  { label: "?",     value: "?\r",  desc: "ASCII query" },
  { label: "R",     value: "R\r",  desc: "Read" },
  { label: "S",     value: "S\r",  desc: "Status" },
  { label: "ENQ",   value: "\x05", desc: "0x05 enquiry byte" },
  { label: "SOH",   value: "\x01", desc: "0x01 start-of-header" },
];

// Modbus RTU CRC-16 (little-endian appended to frame)
function modbusRtuCrc(buf: number[]): number {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

function buildModbusFrame(unitId: number, fc: number, startAddr: number, count: number): Uint8Array {
  const frame = [unitId, fc, (startAddr >> 8) & 0xff, startAddr & 0xff, (count >> 8) & 0xff, count & 0xff];
  const crc = modbusRtuCrc(frame);
  return new Uint8Array([...frame, crc & 0xff, (crc >> 8) & 0xff]);
}

// Space-separated hex string → Uint8Array, e.g. "01 03 00 00 00 10 44 06"
function parseHexBytes(hex: string): Uint8Array | null {
  const tokens = hex.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === "") return null;
  const bytes = tokens.map(t => parseInt(t, 16));
  if (bytes.some(b => isNaN(b) || b < 0 || b > 255)) return null;
  return new Uint8Array(bytes);
}

const MODBUS_PROBES = [
  { label: "FC03 u1 @0 ×16", frame: buildModbusFrame(1, 0x03, 0, 16), desc: "Modbus FC03 read 16 holding regs, unit 1, addr 0" },
  { label: "FC04 u1 @0 ×16", frame: buildModbusFrame(1, 0x04, 0, 16), desc: "Modbus FC04 read 16 input regs, unit 1, addr 0" },
  { label: "FC01 u1 @0 ×8",  frame: buildModbusFrame(1, 0x01, 0, 8),  desc: "Modbus FC01 read 8 coils, unit 1, addr 0" },
  { label: "FC03 u1 @0 ×32", frame: buildModbusFrame(1, 0x03, 0, 32), desc: "Modbus FC03 read 32 holding regs, unit 1, addr 0" },
];

type EntryKind = "rx" | "tx" | "info" | "warn";
type LogEntry  = { ts: string; kind: EntryKind; text: string };

function toHexDump(bytes: Uint8Array): string {
  const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  const ascii = Array.from(bytes).map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : ".").join("");
  return `${hex.padEnd(48)}  ${ascii}`;
}

export default function PiuDiagnosticsPage() {
  const [status, setStatus]         = useState<PiuStatus>("disconnected");
  const [baudRate, setBaudRate]     = useState(9600);
  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMsg, setErrorMsg]     = useState<string | null>(null);
  const [sendInput, setSendInput]   = useState("");
  const [hexInput, setHexInput]     = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [scanning, setScanning]     = useState(false);
  const [scanResults, setScanResults] = useState<{ baud: number; bytes: number; snippet: string }[]>([]);
  const ctrlRef    = useRef<WsBridgeController | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const abortRef   = useRef(false);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, autoScroll]);

  const addEntry = useCallback((kind: EntryKind, text: string) => {
    const ts = new Date().toISOString().slice(11, 23);
    setEntries(prev => {
      const next = [...prev, { ts, kind, text }];
      return next.length > 2000 ? next.slice(-2000) : next;
    });
  }, []);

  const getCtrl = useCallback(() => {
    if (!ctrlRef.current) {
      ctrlRef.current = new WsBridgeController();
    }
    return ctrlRef.current;
  }, []);

  const wireListeners = useCallback((ctrl: WsBridgeController) => {
    ctrl.onStatus(setStatus);
    ctrl.onRawBytes((bytes) => {
      setTotalBytes(n => n + bytes.length);
      addEntry("rx", toHexDump(bytes));
    });
  }, [addEntry]);

  const handleConnect = async () => {
    setErrorMsg(null);
    setTotalBytes(0);
    const ctrl = getCtrl();
    wireListeners(ctrl);
    try {
      await ctrl.connect();
      addEntry("info", `Connected to bridge at ws://localhost:8765 — waiting for data from µ³ RMU…`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorMsg(msg);
    }
  };

  const handleDisconnect = async () => {
    abortRef.current = true;
    setScanning(false);
    await ctrlRef.current?.disconnect();
    setStatus("disconnected");
    addEntry("info", "Disconnected.");
  };

  // ── Auto-scan through baud rates via bridge ───────────────────────────────
  const handleScan = async () => {
    abortRef.current = false;
    setScanning(true);
    setScanResults([]);
    setErrorMsg(null);

    let ctrl = ctrlRef.current;
    if (!ctrl) {
      ctrl = getCtrl();
      wireListeners(ctrl);
    }

    if (ctrl.status !== "connected" && ctrl.status !== "running") {
      try {
        await ctrl.connect();
        addEntry("info", "Connected to bridge — starting baud scan…");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setScanning(false);
        return;
      }
    }

    for (const baud of BAUD_OPTIONS) {
      if (abortRef.current) break;
      addEntry("info", `  Trying ${baud} baud…`);
      await ctrl.setBaud(baud);
      // Wait for the bridge to actually reopen the port before listening, so
      // bytes aren't counted under the wrong baud (or missed during the reopen).
      await ctrl.waitForReopen(3000);

      let bytesThisRound = 0;
      let snippet: number[] = [];
      const unsub = ctrl.onRawBytes((b) => {
        bytesThisRound += b.length;
        if (snippet.length < 32) snippet.push(...Array.from(b));
      });

      await delay(2000);
      unsub();

      const snippetStr = snippet.length
        ? snippet.map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")
        : "—";
      setScanResults(prev => [...prev, { baud, bytes: bytesThisRound, snippet: snippetStr }]);

      if (bytesThisRound > 0) {
        addEntry("info", `  ✓ Got ${bytesThisRound} bytes at ${baud} baud — setting baud to ${baud}`);
        setBaudRate(baud);
        break;
      }
    }

    setScanning(false);
    addEntry("info", "Scan complete.");
  };

  const doSend = async (raw: string) => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    try {
      await ctrl.sendRaw(raw);
      const display = Array.from(new TextEncoder().encode(raw))
        .map(b => b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : `<${b.toString(16).padStart(2, "0")}>`)
        .join("");
      addEntry("tx", `→ ${display}`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const doSendBytes = async (bytes: Uint8Array, label?: string) => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    try {
      await ctrl.sendRawBytes(bytes);
      const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
      addEntry("tx", `→ [${label ?? "bytes"}] ${hex}`);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSendHex = async () => {
    const bytes = parseHexBytes(hexInput);
    if (!bytes) { setErrorMsg("Invalid hex — use space-separated bytes, e.g.: 01 03 00 00 00 10 44 06"); return; }
    setErrorMsg(null);
    await doSendBytes(bytes, "hex");
    setHexInput("");
  };

  const handleSendInput = async () => {
    if (!sendInput) return;
    await doSend(sendInput + "\r");
    setSendInput("");
    inputRef.current?.focus();
  };

  const isConnected = status === "connected" || status === "running";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold">PIU Diagnostics — Serial Monitor</h1>
      <p className="mb-2 text-sm text-muted-foreground">
        Reads the Calibron µ³ RMU via a local Node.js bridge. Raw hex dump of every received byte.
      </p>

      {/* Bridge setup instructions */}
      <div className="mb-5 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
        <p className="mb-2 text-sm font-medium text-blue-900 dark:text-blue-100">
          Start the bridge first (one-time setup)
        </p>
        <p className="mb-2 text-xs text-blue-800 dark:text-blue-200">
          Open a second terminal window. Find the adapter&apos;s COM port first
          (COM6 is the Bluetooth link — the wired ATEN adapter is a different port,
          e.g. COM4), then start the bridge on it:
        </p>
        <pre className="rounded bg-black/80 p-3 text-xs text-green-400 leading-6">{`cd C:\\projects\\energycal_repo\\serial-bridge
npm install
node list-ports.js          # identify the ATEN port
node bridge.js COM4 9600    # use the port from the list`}</pre>
        <p className="mt-2 text-xs text-blue-700 dark:text-blue-300">
          You should see <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">✓ COM4 open at 9600 baud</code> and{" "}
          <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">✓ WebSocket listening on ws://127.0.0.1:8765</code>.
          Leave that window open, then click Connect below. If you see{" "}
          <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">Access denied</code>, the port is open in
          another app — close PROVEit / Serial Port Monitor first.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("h-2.5 w-2.5 rounded-full", STATUS_COLOR[status])} aria-hidden />
          <span className="capitalize">
            {scanning ? `Scanning ${baudRate} baud…` : status}
          </span>
          {totalBytes > 0 && (
            <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-mono text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {totalBytes} bytes received
            </span>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Baud</span>
          <select value={baudRate}
            onChange={async e => {
              const b = Number(e.target.value);
              setBaudRate(b);
              if (isConnected) await ctrlRef.current?.setBaud(b);
            }}
            className="rounded border bg-background px-2 py-1 text-sm">
            {BAUD_OPTIONS.map(b => <option key={b} value={b}>{b.toLocaleString()}</option>)}
          </select>
        </label>

        {isConnected && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Signals:</span>
            <button onClick={() => { ctrlRef.current?.pulseDtr(); addEntry("info", "Pulsed DTR (1→0→1)"); }}
              title="Drop DTR to LOW briefly then raise back to HIGH — PROVEit's reset pulse"
              className="rounded border bg-muted px-2 py-1 font-mono hover:bg-muted/60">
              Pulse DTR
            </button>
            <button onClick={() => { ctrlRef.current?.setSignals({ dtr: true, rts: false });  addEntry("info", "DTR=1 RTS=0 (PROVEit default)"); }}
              className="rounded border bg-muted px-2 py-1 font-mono hover:bg-muted/60">
              DTR=1 RTS=0
            </button>
            <button onClick={() => { ctrlRef.current?.setSignals({ dtr: false, rts: false }); addEntry("info", "DTR=0 RTS=0"); }}
              className="rounded border bg-muted px-2 py-1 font-mono hover:bg-muted/60">
              DTR=0 RTS=0
            </button>
            <button onClick={() => { ctrlRef.current?.setSignals({ dtr: true, rts: true });   addEntry("info", "DTR=1 RTS=1"); }}
              className="rounded border bg-muted px-2 py-1 font-mono hover:bg-muted/60">
              DTR=1 RTS=1
            </button>
          </div>
        )}

        <div className="ml-auto flex flex-wrap gap-2">
          {!isConnected && !scanning
            ? <>
                <Button size="sm" onClick={handleConnect}>Connect to bridge</Button>
                <Button size="sm" variant="secondary" onClick={handleScan} disabled={scanning}>
                  Auto-scan baud rates
                </Button>
              </>
            : <Button size="sm" variant="destructive" onClick={handleDisconnect}>
                {scanning ? "Stop" : "Disconnect"}
              </Button>}
          <Button size="sm" variant="secondary"
            onClick={() => { setEntries([]); setTotalBytes(0); setScanResults([]); }}>
            Clear
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAutoScroll(v => !v)}>
            Scroll: {autoScroll ? "on" : "off"}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-3 whitespace-pre-line rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Hex terminal */}
      <div className="h-[360px] overflow-y-auto rounded-lg border bg-black p-3 font-mono text-xs">
        {entries.length === 0
          ? <p className="text-green-800">
              {isConnected
                ? "Connected to bridge — waiting for bytes from µ³ RMU…"
                : "Start the bridge in a terminal, then click Connect above."}
            </p>
          : entries.map((e, i) => (
            <div key={i} className={cn("leading-5 whitespace-pre",
              e.kind === "rx"   ? "text-green-400" :
              e.kind === "tx"   ? "text-cyan-400"  :
              e.kind === "warn" ? "text-red-400"   :
                                  "text-yellow-600")}>
              <span className="mr-3 opacity-50">{e.ts}</span>{e.text}
            </div>
          ))}
        <div ref={bottomRef} />
      </div>

      {/* Scan results */}
      {scanResults.length > 0 && (
        <div className="mt-3 rounded-lg border p-3">
          <p className="mb-2 text-sm font-medium">Baud scan results</p>
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-1 text-left">Baud</th>
                <th className="py-1 text-right">Bytes rx</th>
                <th className="py-1 pl-4 text-left">First bytes (hex)</th>
              </tr>
            </thead>
            <tbody>
              {scanResults.map((r, i) => (
                <tr key={i} className={cn("border-b last:border-0",
                  r.bytes > 0 && "bg-emerald-50 dark:bg-emerald-950/30")}>
                  <td className="py-1 font-medium">{r.baud} {r.bytes > 0 && "✓"}</td>
                  <td className={cn("py-1 text-right",
                    r.bytes > 0 ? "font-bold text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                    {r.bytes}
                  </td>
                  <td className="py-1 pl-4 text-muted-foreground break-all">{r.snippet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Send panel */}
      <div className="mt-3 rounded-lg border p-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Send to µ³ RMU — ASCII
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK_COMMANDS.map(cmd => (
            <button key={cmd.label} onClick={() => doSend(cmd.value)}
              disabled={!isConnected} title={cmd.desc}
              className="rounded border bg-muted px-2 py-1 font-mono text-xs hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40">
              {cmd.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input ref={inputRef} value={sendInput}
            onChange={e => setSendInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSendInput()}
            disabled={!isConnected}
            placeholder="Type command — Enter adds CR and sends"
            className="flex-1 rounded border bg-background px-3 py-1.5 font-mono text-sm disabled:opacity-50" />
          <Button size="sm" onClick={handleSendInput} disabled={!isConnected || !sendInput}>
            Send ↵
          </Button>
        </div>
      </div>

      {/* Modbus RTU probe panel */}
      <div className="mt-3 rounded-lg border p-3">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Modbus RTU probes
        </p>
        <p className="mb-2 text-xs text-muted-foreground">
          µ³ RMU may support Modbus RTU on COM1 RS232. Try each — any non-error response means Modbus is active.
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {MODBUS_PROBES.map(p => (
            <button key={p.label} onClick={() => doSendBytes(p.frame, p.label)}
              disabled={!isConnected} title={p.desc}
              className="rounded border bg-amber-50 px-2 py-1 font-mono text-xs hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-amber-950/30 dark:hover:bg-amber-900/40">
              {p.label}
            </button>
          ))}
        </div>

        {/* Raw hex send */}
        <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Send raw hex bytes
        </p>
        <div className="flex gap-2">
          <input value={hexInput}
            onChange={e => setHexInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSendHex()}
            disabled={!isConnected}
            placeholder="e.g. 01 03 00 00 00 10 44 06"
            className="flex-1 rounded border bg-background px-3 py-1.5 font-mono text-sm disabled:opacity-50" />
          <Button size="sm" variant="secondary" onClick={handleSendHex} disabled={!isConnected || !hexInput}>
            Send hex
          </Button>
        </div>
      </div>
    </main>
  );
}

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}
