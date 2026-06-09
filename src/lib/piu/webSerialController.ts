"use client";

// Real Web Serial driver for PIU hardware (Calibron / OMNI / AccuLoad).
// Call setPiuController(createWebSerialController()) once at app boot
// (or from the diagnostics page) to swap out the v0 stub.
//
// Web Serial is only available in Chromium-based browsers (Chrome / Edge)
// over HTTPS or localhost.

import type {
  PiuController,
  PiuLiveSample,
  PiuPassCompletion,
  PiuStatus,
} from "./controller";

// Web Serial API type declarations (not in lib.dom.d.ts in all TS configs)
type ParityType = "none" | "even" | "odd" | "mark" | "space";

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface SerialPortOpenOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: ParityType;
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

interface SerialPortSignals {
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
  break?: boolean;
}

interface SerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: SerialPortOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
  setSignals(signals: SerialPortSignals): Promise<void>;
  getSignals(): Promise<{ clearToSend: boolean; dataSetReady: boolean; ringIndicator: boolean; dataCarrierDetect: boolean }>;
}

interface WebSerial {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

export interface WebSerialOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: ParityType;
  flowControl?: "none" | "hardware";
  filters?: SerialPortFilter[];
  connectDelayMs?: number;
  // Line state to leave after open. PROVEit's capture ends at DTR=HIGH, RTS=LOW
  // (CLR_RTS then SET_DTR) and the µ³ then streams. RTS=HIGH keeps it silent, so
  // default rts=false. Do NOT assert both (the original bug did, → no data).
  dtr?: boolean;
  rts?: boolean;
}

const DEFAULTS: Required<Omit<WebSerialOptions, "filters">> = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
  flowControl: "none",
  connectDelayMs: 200,
  dtr: true,
  rts: false,
};

type StatusListener = (s: PiuStatus) => void;
type SampleListener = (s: PiuLiveSample) => void;
type RawLineListener = (line: string) => void;
// Fires for every received chunk regardless of line endings — catches binary protocols
type RawBytesListener = (bytes: Uint8Array) => void;

export class WebSerialController implements PiuController {
  status: PiuStatus = "disconnected";

  private opts: Required<Omit<WebSerialOptions, "filters">> & Pick<WebSerialOptions, "filters">;
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  private statusListeners  = new Set<StatusListener>();
  private sampleListeners  = new Set<SampleListener>();
  private rawListeners     = new Set<RawLineListener>();
  private bytesListeners   = new Set<RawBytesListener>();

  // Generation counter — prevents a closing read loop from clobbering a newly opened one
  private readLoopGen = 0;

  // Ring buffer of recent raw lines (capped so memory stays bounded)
  private rawBuffer: string[] = [];
  private readonly rawBufferMax = 500;

  constructor(opts: WebSerialOptions = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  // ── Status ────────────────────────────────────────────────────────────────

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(s: PiuStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  // ── Live sample subscription ───────────────────────────────────────────────

  subscribe(listener: SampleListener): () => void {
    this.sampleListeners.add(listener);
    return () => this.sampleListeners.delete(listener);
  }

  // ── Raw line subscription (diagnostics / protocol reverse-engineering) ────

  onRawLine(listener: RawLineListener): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  // Fires on every received chunk — use this to see binary data that has no line endings
  onRawBytes(listener: RawBytesListener): () => void {
    this.bytesListeners.add(listener);
    return () => this.bytesListeners.delete(listener);
  }

  getRawBuffer(): readonly string[] {
    return this.rawBuffer;
  }

  // ── Send raw bytes (for manual polling / protocol discovery) ─────────────

  async sendRaw(text: string): Promise<void> {
    if (!this.port?.writable) {
      throw new Error("Not connected — connect first.");
    }
    const writer = this.port.writable.getWriter();
    try {
      const bytes = new TextEncoder().encode(text);
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  // ── Connect / disconnect ───────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "running") {
      await this.disconnect();
      return;
    }
    if (this.status === "connecting") return;

    if (typeof navigator === "undefined" || !("serial" in navigator)) {
      throw new Error(
        "Web Serial API is not available. Use Chrome or Edge over HTTPS (or localhost).",
      );
    }

    this.setStatus("connecting");

    try {
      // Show the browser's native port picker — user selects the COM port
      const filters = this.opts.filters ?? [];
      this.port = await (navigator as Navigator & { serial: WebSerial }).serial.requestPort(
        filters.length ? { filters } : undefined,
      );

      await this.port.open({
        baudRate: this.opts.baudRate,
        dataBits: this.opts.dataBits as 7 | 8,
        stopBits: this.opts.stopBits as 1 | 2,
        parity: this.opts.parity,
        flowControl: this.opts.flowControl,
      });

      // Replay PROVEit's end-state (DTR=HIGH, RTS=LOW). Windows asserts both on a
      // native open; Web Serial leaves them undefined, so we set them explicitly.
      // RTS must stay LOW — asserting it high keeps the µ³ RMU silent.
      await this.assertSignals();

      // Start reading immediately so a burst emitted the instant signals assert
      // isn't lost during the settle delay.
      this.setStatus("connected");
      this.startReadLoop();

      if (this.opts.connectDelayMs > 0) {
        await delay(this.opts.connectDelayMs);
      }
    } catch (err) {
      this.port = null;
      // User cancelled the picker — stay disconnected rather than erroring
      if (err instanceof Error && err.name === "NotFoundError") {
        this.setStatus("disconnected");
      } else {
        this.setStatus("error");
        throw err;
      }
    }
  }

  async disconnect(): Promise<void> {
    // Bump gen so the running loop exits cleanly without touching status
    this.readLoopGen++;
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { await this.port?.close(); } catch { /* ignore */ }
    this.reader = null;
    // Note: this.port is kept so openWithSettings() can reuse it for auto-scan
    this.setStatus("disconnected");
  }

  // Re-open the already-selected port with different settings — used by auto-scan.
  // Caller must call disconnect() first.
  async openWithSettings(opts: Pick<WebSerialOptions, "baudRate" | "parity" | "flowControl">): Promise<void> {
    if (!this.port) throw new Error("No port selected — call connect() first to pick a port.");
    this.opts = { ...this.opts, ...opts };
    this.setStatus("connecting");
    try {
      await this.port.open({
        baudRate: this.opts.baudRate,
        dataBits: this.opts.dataBits as 7 | 8,
        stopBits: this.opts.stopBits as 1 | 2,
        parity: this.opts.parity,
        flowControl: this.opts.flowControl,
      });
      await this.assertSignals();
      this.setStatus("connected");
      this.startReadLoop();
    } catch (err) {
      this.setStatus("error");
      throw err;
    }
  }

  hasPort(): boolean {
    return this.port !== null;
  }

  private async assertSignals() {
    const dtr = this.opts.dtr;
    const rts = this.opts.rts;
    try {
      // Mirror PROVEit: clear both, set the RTS level while DTR is low, THEN raise
      // DTR. On Windows usbser.sys only emits SET_CONTROL_LINE_STATE on a DTR
      // change, so raising DTR last is what actually pushes the RTS level to the
      // adapter. (The old code asserted DTR+RTS both high → the µ³ stayed silent.)
      await this.port?.setSignals({ dataTerminalReady: false, requestToSend: false });
      await delay(20);
      await this.port?.setSignals({ dataTerminalReady: false, requestToSend: rts });
      await delay(20);
      await this.port?.setSignals({ dataTerminalReady: dtr, requestToSend: rts });
    } catch (err) {
      // Surfacing this matters: a swallowed failure here looks identical to a dead
      // device (green "connected", zero bytes). Warn loudly.
      console.warn(
        "[WebSerial] setSignals() failed — DTR/RTS may not have been applied; " +
        "the device may stay silent. On some Windows/Prolific stacks setSignals " +
        "rejects outright.",
        err,
      );
    }
  }

  // ── Pass control ───────────────────────────────────────────────────────────
  // Full protocol parsing is v1+. For now runPass() resolves once it sees a
  // line containing pulse data; abort() cancels the pending run.

  private passResolve: ((c: PiuPassCompletion) => void) | null = null;
  private passReject: ((e: Error) => void) | null = null;

  async runPass(): Promise<PiuPassCompletion> {
    if (this.status !== "connected") {
      throw new Error("PIU is not connected. Connect before starting a pass.");
    }
    this.setStatus("running");
    return new Promise<PiuPassCompletion>((resolve, reject) => {
      this.passResolve = resolve;
      this.passReject = reject;
    });
  }

  async abort(): Promise<void> {
    if (this.passReject) {
      this.passReject(new Error("Pass aborted by operator"));
      this.passResolve = null;
      this.passReject = null;
    }
    if (this.status === "running" || this.status === "aborting") {
      this.setStatus(this.port ? "connected" : "disconnected");
    }
  }

  // ── Analog config (stub until protocol docs are confirmed) ─────────────────

  async getAnalogConfig(): Promise<Record<string, unknown>> {
    return {};
  }
  async setAnalogConfig(_cfg: Record<string, unknown>): Promise<void> {}

  // ── Internal read loop ─────────────────────────────────────────────────────

  private async startReadLoop() {
    const readable = this.port?.readable;
    if (!readable) return;

    // Bump generation so any previous loop that's still winding down
    // knows it has been superseded and should not touch shared state.
    const myGen = ++this.readLoopGen;
    this.reader = readable.getReader();
    const decoder = new TextDecoder("ascii");
    let partial = "";

    try {
      while (true) {
        const result = await this.reader.read();
        if (result.done || myGen !== this.readLoopGen) break;

        // Fire raw bytes immediately — catches binary protocols with no line endings
        this.bytesListeners.forEach((cb) => cb(result.value));

        const chunk = decoder.decode(result.value, { stream: true });
        partial += chunk;

        const lines = partial.split(/\r\n|\r|\n/);
        partial = lines.pop() ?? "";
        for (const line of lines) this.handleLine(line);
      }
    } catch {
      // Port closed or read cancelled
    } finally {
      if (myGen === this.readLoopGen && this.status !== "disconnected") {
        this.setStatus("disconnected");
      }
    }
  }

  private handleLine(raw: string) {
    const line = raw.trim();
    if (!line) return;

    // Store in ring buffer
    if (this.rawBuffer.length >= this.rawBufferMax) {
      this.rawBuffer.shift();
    }
    this.rawBuffer.push(line);
    this.rawListeners.forEach((cb) => cb(line));

    // Best-effort: try to parse a live sample from the line.
    // Real parsers for Calibron / OMNI / AccuLoad will be added once the
    // protocol format is confirmed from live capture data.
    const sample = tryParseSample(line);
    if (sample && Object.keys(sample).length > 0) {
      this.sampleListeners.forEach((cb) => cb(sample));
    }

    // If a pass is pending, try to extract a completion payload
    if (this.passResolve && this.status === "running") {
      const completion = tryParsePassCompletion(line);
      if (completion) {
        this.setStatus("connected");
        this.passResolve(completion);
        this.passResolve = null;
        this.passReject = null;
      }
    }
  }
}

// ── Protocol helpers (to be refined once live capture data is available) ─────

// Generic key=value parser — covers many ASCII-based serial protocols.
// e.g. "TM=75.4 PM=45.2 TP=76.1 PP=44.8 FLOW=250.0 FREQ=1234.5"
function parseKV(line: string): Record<string, number> {
  const out: Record<string, number> = {};
  // Match KEY=VALUE pairs (with optional whitespace around =)
  const re = /([A-Z_]+)\s*=\s*([-+]?\d+\.?\d*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const val = parseFloat(m[2]);
    if (Number.isFinite(val)) out[m[1].toUpperCase()] = val;
  }
  return out;
}

function tryParseSample(line: string): PiuLiveSample | null {
  const kv = parseKV(line);
  if (Object.keys(kv).length === 0) return null;
  const sample: PiuLiveSample = {};
  if ("TM" in kv) sample.meterTempF = kv.TM;
  if ("PM" in kv) sample.meterPressurePsig = kv.PM;
  if ("TP" in kv) sample.proverTempF = kv.TP;
  if ("PP" in kv) sample.proverPressurePsig = kv.PP;
  if ("FLOW" in kv) sample.flowRate = kv.FLOW;
  if ("FREQ" in kv) sample.frequencyHz = kv.FREQ;
  if ("PULSES" in kv) sample.pulses = kv.PULSES;
  return sample;
}

function tryParsePassCompletion(line: string): PiuPassCompletion | null {
  const kv = parseKV(line);
  // Require at minimum pulses + at least one temperature to be considered
  // a pass-completion record (prevents false positives on status lines).
  if (!("PULSES" in kv) || !("TM" in kv)) return null;
  return {
    pulses: kv.PULSES,
    meterTempF: kv.TM ?? 0,
    meterPressurePsig: kv.PM ?? 0,
    proverTempF: kv.TP ?? 0,
    proverPressurePsig: kv.PP ?? 0,
    flowRate: kv.FLOW,
    frequencyHz: kv.FREQ,
  };
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
