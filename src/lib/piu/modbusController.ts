"use client";

// PiuController backed by the Newflow P572 RMU in RTU mode, over Modbus/TCP.
//
// The browser can't open raw TCP, so this controller POSTs to /api/piu/modbus
// (which talks Modbus to the RMU server-side) on a poll loop, and surfaces the
// result as PiuLiveSample (for the wizard) plus a richer P572Reading (for
// diagnostics). Drop it in with:
//
//   setPiuController(new ModbusP572Controller({ ip: "10.255.255.255" }))
//
// runPass() resolves when the prover state machine reaches "Done" (status 7) and
// returns the per-pass pulse count + scaled temps/pressures.

import type {
  PiuController,
  PiuLiveSample,
  PiuPassCompletion,
  PiuStatus,
} from "./controller";
import { toLiveSample, type ChannelMap, type P572Reading } from "./modbus/p572";

export interface ModbusControllerOptions {
  ip: string;
  unitId?: number;
  pollMs?: number;
  apiPath?: string;
  channelMap?: ChannelMap; // 4-20mA → Tm/Pm/Tp/Pp scaling (site config)
}

type StatusListener = (s: PiuStatus) => void;
type SampleListener = (s: PiuLiveSample) => void;
type ReadingListener = (r: P572Reading) => void;

export class ModbusP572Controller implements PiuController {
  status: PiuStatus = "disconnected";

  private readonly ip: string;
  private readonly unitId: number;
  private readonly pollMs: number;
  private readonly apiPath: string;
  private channelMap?: ChannelMap;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private last: P572Reading | null = null;
  private prevProverStatus = -1;

  private statusListeners = new Set<StatusListener>();
  private sampleListeners = new Set<SampleListener>();
  private readingListeners = new Set<ReadingListener>();

  private passResolve: ((c: PiuPassCompletion) => void) | null = null;
  private passReject: ((e: Error) => void) | null = null;

  constructor(opts: ModbusControllerOptions) {
    this.ip = opts.ip;
    this.unitId = opts.unitId ?? 1;
    this.pollMs = opts.pollMs ?? 1000;
    this.apiPath = opts.apiPath ?? "/api/piu/modbus";
    this.channelMap = opts.channelMap;
  }

  // ── Subscriptions ───────────────────────────────────────────────────────────
  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }
  subscribe(cb: SampleListener): () => void {
    this.sampleListeners.add(cb);
    return () => this.sampleListeners.delete(cb);
  }
  /** Diagnostics tap: every decoded register reading (beyond PiuController). */
  onReading(cb: ReadingListener): () => void {
    this.readingListeners.add(cb);
    return () => this.readingListeners.delete(cb);
  }

  private setStatus(s: PiuStatus) {
    this.status = s;
    this.statusListeners.forEach((cb) => cb(s));
  }

  // ── Connect / disconnect ────────────────────────────────────────────────────
  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "running") {
      await this.disconnect();
      return;
    }
    this.setStatus("connecting");
    try {
      const r = await this.readOnce(); // fail fast if the RMU is unreachable / not in RTU mode
      this.last = r;
      this.prevProverStatus = r.proverStatus;
      this.setStatus("connected");
      this.startPolling();
    } catch (e) {
      this.setStatus("error");
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async disconnect(): Promise<void> {
    this.generation++; // supersede any in-flight poll
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.passReject) {
      this.passReject(new Error("Disconnected"));
      this.passResolve = null;
      this.passReject = null;
    }
    this.setStatus("disconnected");
  }

  // ── Polling ─────────────────────────────────────────────────────────────────
  private async readOnce(): Promise<P572Reading> {
    const res = await fetch(this.apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ip: this.ip, unitId: this.unitId }),
    });
    const json = (await res.json()) as { ok: boolean; reading?: P572Reading; error?: string };
    if (!res.ok || !json.ok || !json.reading) {
      throw new Error(json?.error ?? `Modbus read failed (HTTP ${res.status})`);
    }
    return json.reading;
  }

  private startPolling() {
    const myGen = ++this.generation;
    const tick = async () => {
      if (myGen !== this.generation) return;
      try {
        const r = await this.readOnce();
        if (myGen !== this.generation) return;
        this.last = r;
        this.readingListeners.forEach((cb) => cb(r));
        this.sampleListeners.forEach((cb) => cb(toLiveSample(r, this.channelMap)));
        this.detectPassCompletion(r);
        // Recover from a previous transient read error.
        if (this.status === "error") this.setStatus(this.passResolve ? "running" : "connected");
      } catch {
        // Keep polling through transient blips; reflect the trouble in status.
        if (myGen === this.generation && this.status !== "disconnected") this.setStatus("error");
      }
      if (myGen === this.generation) this.timer = setTimeout(tick, this.pollMs);
    };
    this.timer = setTimeout(tick, 0);
  }

  // ── Pass control ────────────────────────────────────────────────────────────
  // v1: detect a completed prove by watching the prover state machine roll to
  // "Done" (7). Auto-launch (writing the initiate-prove register) is intentionally
  // not wired yet — driving prover valves is safety-sensitive; refine with the plan.
  async runPass(): Promise<PiuPassCompletion> {
    if (this.status !== "connected") {
      throw new Error("RMU is not connected. Connect before running a pass.");
    }
    this.setStatus("running");
    this.prevProverStatus = this.last?.proverStatus ?? -1;
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
      this.setStatus(this.last ? "connected" : "disconnected");
    }
  }

  private detectPassCompletion(r: P572Reading) {
    if (this.passResolve && this.prevProverStatus !== 7 && r.proverStatus === 7) {
      const sample = toLiveSample(r, this.channelMap);
      const completion: PiuPassCompletion = {
        pulses: r.proverPulseSw1Sw2 || r.goodPulseCount || 0,
        meterTempF: sample.meterTempF ?? 0,
        meterPressurePsig: sample.meterPressurePsig ?? 0,
        proverTempF: sample.proverTempF ?? 0,
        proverPressurePsig: sample.proverPressurePsig ?? 0,
        frequencyHz: r.freqA,
      };
      const resolve = this.passResolve;
      this.passResolve = null;
      this.passReject = null;
      this.setStatus("connected");
      resolve(completion);
    }
    this.prevProverStatus = r.proverStatus;
  }

  // ── Analog config (stub until the plan defines channel mapping UI) ────────────
  async getAnalogConfig(): Promise<Record<string, unknown>> {
    return { channelMap: this.channelMap ?? null };
  }
  async setAnalogConfig(_cfg: Record<string, unknown>): Promise<void> {}

  /** Update the 4-20mA → Tm/Pm/Tp/Pp scaling live (e.g. from the wizard's analog config). */
  setChannelMap(map?: ChannelMap): void {
    this.channelMap = map;
  }

  /** Most recent decoded reading, or null before the first poll. */
  getLastReading(): P572Reading | null {
    return this.last;
  }
}
