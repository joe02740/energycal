"use client";

// PiuController for the Newflow RMU's proprietary PIU protocol over RS-232, when
// the unit can't be put in Modbus/RTU mode (no Ethernet, SW1 sealed in).
//
// The browser can't reliably open the Prolific port directly (Web Serial), so this
// talks to the local serial bridge (serial-bridge/bridge.js, ws://127.0.0.1:8765),
// which forwards bytes to/from COM. The controller polls the P4 block ("50 34"),
// frames the responses, and decodes them in the browser via the pure decode module.
//
//   1) node serial-bridge/bridge.js COM6 9600
//   2) setPiuController(new PiuRs232Controller())
//
// Temp/pressure are validated against PROVEit to 0.05°F / 0.01 psi. Frequency/pulses
// need a real meter on the pulse input (not mapped yet).

import type {
  PiuController,
  PiuLiveSample,
  PiuPassCompletion,
  PiuStatus,
} from "./controller";
import {
  isValidP4,
  decodeP4Delta,
  P4_LEN,
  DEFAULT_ANALOG,
  CMD_LAUNCH,
  ACK_LAUNCH,
  type AnalogInput,
  type PiuReading,
} from "./piuRs232/decode";

export interface PiuRs232Options {
  wsUrl?: string; // serial bridge, default ws://127.0.0.1:8765
  pollMs?: number; // poll cadence for "50 34"
  windowMs?: number; // delta window length
  analog?: AnalogInput[]; // per-channel scaling (defaults to PROVEit's config)
}

const POLL_CMD = new Uint8Array([0x50, 0x34]);

type StatusListener = (s: PiuStatus) => void;
type SampleListener = (s: PiuLiveSample) => void;
type ReadingListener = (r: PiuReading) => void;

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class PiuRs232Controller implements PiuController {
  status: PiuStatus = "disconnected";

  private readonly wsUrl: string;
  private readonly pollMs: number;
  private readonly windowFrames: number;

  private ws: WebSocket | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private acc: Uint8Array = new Uint8Array(0);
  private frames: Uint8Array[] = [];
  private last: PiuReading | null = null;
  private analog: AnalogInput[];
  private launchAck: (() => void) | null = null;

  private statusListeners = new Set<StatusListener>();
  private sampleListeners = new Set<SampleListener>();
  private readingListeners = new Set<ReadingListener>();

  constructor(opts: PiuRs232Options = {}) {
    this.wsUrl = opts.wsUrl ?? "ws://127.0.0.1:8765";
    this.pollMs = opts.pollMs ?? 400;
    this.windowFrames = Math.max(2, Math.round((opts.windowMs ?? 4000) / this.pollMs));
    this.analog = opts.analog ?? DEFAULT_ANALOG;
  }

  onStatus(cb: StatusListener) { this.statusListeners.add(cb); return () => this.statusListeners.delete(cb); }
  subscribe(cb: SampleListener) { this.sampleListeners.add(cb); return () => this.sampleListeners.delete(cb); }
  onReading(cb: ReadingListener) { this.readingListeners.add(cb); return () => this.readingListeners.delete(cb); }

  /** Live-update the per-channel analog scaling (PROVEit Analog-Config model). */
  setAnalogScaling(analog: AnalogInput[]) {
    this.analog = analog;
    if (this.frames.length >= 2) {
      const r = decodeP4Delta(this.frames[0], this.frames[this.frames.length - 1], this.analog);
      if (r) { this.last = r; this.readingListeners.forEach((cb) => cb(r)); this.sampleListeners.forEach((cb) => cb(this.toSample(r))); }
    }
  }

  private setStatus(s: PiuStatus) { this.status = s; this.statusListeners.forEach((cb) => cb(s)); }

  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "running") { await this.disconnect(); return; }
    this.setStatus("connecting");
    this.acc = new Uint8Array(0);
    this.frames = [];

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        ws.close();
        this.setStatus("error");
        reject(new Error(`Timed out reaching the serial bridge at ${this.wsUrl}.\nStart it first:  node serial-bridge/bridge.js COM6 9600`));
      }, 5000);

      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          this.handleControl(ev.data, () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            this.setStatus("connected");
            this.startPolling();
            resolve();
          });
        } else {
          this.ingest(new Uint8Array(ev.data as ArrayBuffer));
        }
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.setStatus("error");
        reject(new Error(`Cannot reach the serial bridge at ${this.wsUrl}.\nRun:  node serial-bridge/bridge.js COM6 9600`));
      };
      ws.onclose = () => {
        if (this.status !== "disconnected") this.setStatus("disconnected");
      };
    });
  }

  async disconnect(): Promise<void> {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.acc = new Uint8Array(0);
    this.frames = [];
    this.setStatus("disconnected");
  }

  private handleControl(raw: string, onOpen: () => void) {
    try {
      const msg = JSON.parse(raw) as { type: string; message?: string };
      if (msg.type === "serial_open") onOpen();
      else if (msg.type === "serial_error") { this.setStatus("error"); }
      else if (msg.type === "serial_closed") { this.setStatus("error"); }
    } catch { /* ignore */ }
  }

  private startPolling() {
    const poll = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(POLL_CMD);
    };
    poll();
    this.pollTimer = setInterval(poll, this.pollMs);
  }

  // Accumulate bytes and pull out frames: the 4-byte launch ack (01 50 99 e9)
  // and 121-byte P4 blocks (resyncing on 01 50 + checksum).
  private ingest(bytes: Uint8Array) {
    this.acc = concat(this.acc, bytes);
    // Launch ack can arrive interleaved with P4 polls — consume it first.
    while (this.acc.length >= ACK_LAUNCH.length && ACK_LAUNCH.every((v, i) => this.acc[i] === v)) {
      this.acc = this.acc.subarray(ACK_LAUNCH.length);
      if (this.launchAck) { this.launchAck(); this.launchAck = null; }
    }
    while (this.acc.length >= P4_LEN) {
      if (!(this.acc[0] === 0x01 && this.acc[1] === 0x50)) {
        let idx = -1;
        for (let i = 1; i + 1 < this.acc.length; i++) {
          if (this.acc[i] === 0x01 && this.acc[i + 1] === 0x50) { idx = i; break; }
        }
        if (idx < 0) { this.acc = this.acc.subarray(this.acc.length - 1); return; }
        this.acc = this.acc.subarray(idx);
        if (this.acc.length < P4_LEN) return;
      }
      const frame = this.acc.subarray(0, P4_LEN);
      if (isValidP4(frame)) { this.onFrame(frame.slice()); this.acc = this.acc.subarray(P4_LEN); }
      else if (ACK_LAUNCH.every((v, i) => this.acc[i] === v)) {
        this.acc = this.acc.subarray(ACK_LAUNCH.length);
        if (this.launchAck) { this.launchAck(); this.launchAck = null; }
      } else { this.acc = this.acc.subarray(1); }
    }
  }

  private onFrame(frame: Uint8Array) {
    this.frames.push(frame);
    if (this.frames.length > this.windowFrames) this.frames.shift();
    if (this.frames.length >= 2) {
      const r = decodeP4Delta(this.frames[0], this.frames[this.frames.length - 1], this.analog);
      if (r) {
        this.last = r;
        this.readingListeners.forEach((cb) => cb(r));
        this.sampleListeners.forEach((cb) => cb(this.toSample(r)));
      }
    }
  }

  private toSample(r: PiuReading): PiuLiveSample {
    const s: PiuLiveSample = {};
    if (r.Tp !== undefined) s.proverTempF = r.Tp;
    if (r.Tm !== undefined) s.meterTempF = r.Tm;
    if (r.Pp !== undefined) s.proverPressurePsig = r.Pp;
    if (r.Pm !== undefined) s.meterPressurePsig = r.Pm;
    if (r.frequencyHz !== undefined) s.frequencyHz = r.frequencyHz; // reserved
    if (r.pulses !== undefined) s.pulses = r.pulses; // reserved
    return s;
  }

  /**
   * Send the P5 launch command ("50 35") — the same single command PROVEit's
   * Auto Run sends. The RMU acks 01 50 99 e9, fires the launch output (500 ms
   * pulse / fwd-rev valve sequencing) and flips into run-active state
   * (status 0x83 → 0x03). CAUTION: this MOVES THE PROVER — only trigger with
   * the line-up made and hydraulics safe.
   */
  async launch(timeoutMs = 3000): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to the serial bridge.");
    }
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => {
        if (this.launchAck) { this.launchAck = null; reject(new Error("No launch ack (01 50 99 e9) from the RMU within timeout.")); }
      }, timeoutMs);
      this.launchAck = () => { clearTimeout(t); resolve(); };
      this.ws!.send(CMD_LAUNCH);
    });
  }

  async runPass(): Promise<PiuPassCompletion> {
    throw new Error(
      "Launch is decoded (use launch()), but the pulse-count field is still unmapped — " +
      "it needs one real prove with detector hits to identify. Enter passes manually for now.",
    );
  }
  async abort(): Promise<void> {}
  async getAnalogConfig(): Promise<Record<string, unknown>> { return {}; }
  async setAnalogConfig(): Promise<void> {}

  getLastReading(): PiuReading | null { return this.last; }
}
