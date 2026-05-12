// PIU controller interface. v0 ships a no-op simulator so the UI controls
// are exercised; v1 swaps in a real Web Serial driver (Calibron / OMNI / AccuLoad)
// behind this same surface. The wizard never imports a concrete driver — it
// always goes through getPiuController().

export type PiuStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "running"
  | "aborting"
  | "error";

export interface PiuLiveSample {
  // Real-time stream the prover/meter pushes during a pass. Fields match the
  // per-pass row that gets written back when accepted.
  meterTempF?: number;
  meterPressurePsig?: number;
  proverTempF?: number;
  proverPressurePsig?: number;
  flowRate?: number;
  frequencyHz?: number;
  pulses?: number;
}

export interface PiuPassCompletion {
  pulses: number;
  meterTempF: number;
  meterPressurePsig: number;
  proverTempF: number;
  proverPressurePsig: number;
  flowRate?: number;
  frequencyHz?: number;
}

export interface PiuController {
  status: PiuStatus;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  // Run a single pass; resolves with the completion payload when the prover
  // reports the detector switches closed. Reject if aborted or hardware error.
  runPass(): Promise<PiuPassCompletion>;
  abort(): Promise<void>;
  // Live tap — UI subscribes to display Tm/Pm/flow rate as the run progresses.
  subscribe(listener: (sample: PiuLiveSample) => void): () => void;
  onStatus(listener: (s: PiuStatus) => void): () => void;
  // Analog channel configuration (Tm, Pm sources etc.). v0 just returns a stub.
  getAnalogConfig(): Promise<Record<string, unknown>>;
  setAnalogConfig(cfg: Record<string, unknown>): Promise<void>;
}

class NotImplementedController implements PiuController {
  status: PiuStatus = "disconnected";
  async connect() {
    throw new Error(
      "PIU connection is not implemented in v0 — use manual entry. v1 will provide a Web Serial driver.",
    );
  }
  async disconnect() {}
  async runPass(): Promise<PiuPassCompletion> {
    throw new Error("Auto run requires a connected PIU (v1).");
  }
  async abort() {}
  subscribe() {
    return () => {};
  }
  onStatus() {
    return () => {};
  }
  async getAnalogConfig() {
    return {};
  }
  async setAnalogConfig() {}
}

let _controller: PiuController = new NotImplementedController();
export function getPiuController(): PiuController {
  return _controller;
}
export function setPiuController(c: PiuController) {
  _controller = c;
}
