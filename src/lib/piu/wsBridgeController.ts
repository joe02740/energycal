"use client";

// PIU controller that talks to the local Node.js serial bridge over WebSocket.
// Swaps in for WebSerialController when the browser's Web Serial API doesn't
// work with the connected USB-to-serial adapter (e.g. ATEN UC-232A).
//
// The bridge (serial-bridge/bridge.js) opens COM6 via the Windows serial API —
// which handles DTR/RTS automatically, exactly like PROVEit does.

import type {
  PiuController,
  PiuLiveSample,
  PiuPassCompletion,
  PiuStatus,
} from "./controller";

export interface WsBridgeOptions {
  url?: string; // default: ws://localhost:8765
}

type StatusListener  = (s: PiuStatus) => void;
type SampleListener  = (s: PiuLiveSample) => void;
type RawLineListener = (line: string) => void;
type RawBytesListener = (bytes: Uint8Array) => void;

export class WsBridgeController implements PiuController {
  status: PiuStatus = "disconnected";

  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private lineBuffer = "";
  // Persistent streaming decoder — recreating it per frame (old bug) drops the
  // multi-byte boundary state {stream:true} exists to preserve.
  private decoder = new TextDecoder("ascii");
  // Resolvers waiting for the next serial_open (used by the baud auto-scan so it
  // doesn't start listening before the bridge has actually reopened the port).
  private openWaiters: Array<() => void> = [];

  private statusListeners  = new Set<StatusListener>();
  private sampleListeners  = new Set<SampleListener>();
  private rawListeners     = new Set<RawLineListener>();
  private bytesListeners   = new Set<RawBytesListener>();

  constructor(opts: WsBridgeOptions = {}) {
    // Connect to 127.0.0.1, NOT "localhost": on Windows 11 "localhost" resolves to
    // ::1 (IPv6) first, which the bridge's 127.0.0.1-only server never answers.
    this.wsUrl = opts.url ?? "ws://127.0.0.1:8765";
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  subscribe(listener: SampleListener): () => void {
    this.sampleListeners.add(listener);
    return () => this.sampleListeners.delete(listener);
  }

  onRawLine(listener: RawLineListener): () => void {
    this.rawListeners.add(listener);
    return () => this.rawListeners.delete(listener);
  }

  onRawBytes(listener: RawBytesListener): () => void {
    this.bytesListeners.add(listener);
    return () => this.bytesListeners.delete(listener);
  }

  private setStatus(s: PiuStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  // ── Connect / disconnect ──────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "running") {
      await this.disconnect();
      return;
    }
    this.setStatus("connecting");
    // Fresh line-assembly state for a new session.
    this.lineBuffer = "";
    this.decoder = new TextDecoder("ascii");

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      ws.binaryType = "arraybuffer";

      const timeout = setTimeout(() => {
        ws.close();
        this.setStatus("error");
        reject(new Error(
          `Timed out connecting to bridge at ${this.wsUrl}.\n` +
          `Start the bridge first:\n` +
          `  cd serial-bridge\n` +
          `  npm install\n` +
          `  node bridge.js`
        ));
      }, 5000);

      ws.onopen = () => {
        // Wait for the bridge to confirm the serial port is open
      };

      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          this.handleControlMessage(event.data, resolve, reject, timeout);
        } else {
          const bytes = new Uint8Array(event.data as ArrayBuffer);
          this.bytesListeners.forEach((cb) => cb(bytes));
          this.processBytes(bytes);
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        this.setStatus("error");
        reject(new Error(
          `Cannot reach bridge at ${this.wsUrl}.\n` +
          `Run:  cd serial-bridge && npm install && node bridge.js`
        ));
      };

      ws.onclose = () => {
        if (this.status !== "disconnected") {
          this.setStatus("disconnected");
        }
      };

      this.ws = ws;
    });
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.lineBuffer = "";
    this.openWaiters = [];
    this.setStatus("disconnected");
  }

  // Resolves on the next serial_open from the bridge (or false on timeout). The
  // baud scan awaits this after setBaud() so it never counts bytes under the
  // wrong baud while the port is still reopening.
  waitForReopen(timeoutMs = 3000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const done = (ok: boolean) => {
        clearTimeout(timer);
        this.openWaiters = this.openWaiters.filter((w) => w !== onOpen);
        resolve(ok);
      };
      const onOpen = () => done(true);
      const timer = setTimeout(() => done(false), timeoutMs);
      this.openWaiters.push(onOpen);
    });
  }

  // ── Send raw bytes ─────────────────────────────────────────────────────────

  async sendRaw(text: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to bridge.");
    }
    this.ws.send(new TextEncoder().encode(text));
  }

  async sendRawBytes(bytes: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to bridge.");
    }
    this.ws.send(bytes);
  }

  // Tell the bridge to reopen the serial port at a new baud rate
  async setBaud(baudRate: number): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "set_baud", baudRate }));
  }

  // Pulse DTR low then back high — many instruments treat this as a host-attached reset
  async pulseDtr(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "pulse_dtr" }));
  }

  async setSignals(opts: { dtr?: boolean; rts?: boolean }): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type: "set_signals", ...opts }));
  }

  // ── PiuController interface stubs (v1+) ───────────────────────────────────

  async runPass(): Promise<PiuPassCompletion> {
    throw new Error("Auto run not yet implemented via bridge.");
  }
  async abort(): Promise<void> {}
  async getAnalogConfig(): Promise<Record<string, unknown>> { return {}; }
  async setAnalogConfig(_cfg: Record<string, unknown>): Promise<void> {}

  // ── Internal ──────────────────────────────────────────────────────────────

  private handleControlMessage(
    raw: string,
    resolve: () => void,
    reject: (e: Error) => void,
    timeout: ReturnType<typeof setTimeout>,
  ) {
    try {
      const msg = JSON.parse(raw) as { type: string; message?: string; baud?: number };
      if (msg.type === "serial_open") {
        clearTimeout(timeout);
        this.setStatus("connected");
        resolve(); // no-op if the connect promise already settled (e.g. after a reopen)
        // Wake anyone waiting on a reopen (baud scan), then clear the list.
        const waiters = this.openWaiters;
        this.openWaiters = [];
        waiters.forEach((w) => w());
      } else if (msg.type === "serial_error") {
        clearTimeout(timeout);
        this.setStatus("error");
        reject(new Error(`Bridge serial error: ${msg.message}`));
      } else if (msg.type === "serial_closed") {
        clearTimeout(timeout);
        // A close during an active session is an error; mid-reopen the bridge
        // suppresses this event, so reaching here means the port really dropped.
        this.setStatus("error");
        reject(new Error("Bridge reports serial port is closed. Check COM port."));
      }
    } catch {
      // ignore malformed messages
    }
  }

  private processBytes(bytes: Uint8Array) {
    this.lineBuffer += this.decoder.decode(bytes, { stream: true });
    const lines = this.lineBuffer.split(/\r\n|\r|\n/);
    this.lineBuffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) this.rawListeners.forEach((cb) => cb(trimmed));
    }
  }
}
