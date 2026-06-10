// Pure PIU "P4" live-data decode + configurable analog scaling. No Node deps —
// safe in both browser and server.
//
// Reverse-engineered + validated 2026-06-05 against PROVEit (to 0.05°F / 0.01 psi):
//   P4 (121 B): counter (uint32 LE @56) + 6 analog accumulators (uint32 LE @
//   60,68,76,84,92,100), each preceded by a copy of the counter. Instantaneous
//   channel value = Δacc / Δcounter. mA = (raw − 21) / 2729  (20 mA ≈ 54,560 counts).
//
// Engineering scaling mirrors PROVEit's "Analog Config" exactly (per input):
//   eng = Zero + (mA − 4)/16 × (Span − Zero) + Offset
// Default config is the one read off PROVEit on this unit; edit it to match the
// real transmitter range (or to trim) — the mA is ground truth, the rest is config.

export const P4_LEN = 121;
export const COUNTER_OFFSET = 56;
export const FIELD_OFFSETS = [60, 68, 76, 84, 92, 100] as const;

// ── Run-control layer (decoded 2026-06-09 from the two Auto Run captures) ─────
// PROVEit's Auto Run sends a single "50 35" (P5) = LAUNCH. The RMU acks with
// 01 50 99 e9, fires DIGOUT1 (500 ms launch pulse / fwd-rev sequencing), clears
// the frequency fields, and flips P4[6] bit7: 0x83 idle → 0x03 run-active.
// Reproduced identically in proveit-capture.pcapng @110.38s and capture2 @134.65s.
export const CMD_POLL_P4 = Uint8Array.from([0x50, 0x34]);
export const CMD_LAUNCH = Uint8Array.from([0x50, 0x35]);
export const ACK_LAUNCH = Uint8Array.from([0x01, 0x50, 0x99, 0xe9]);

export const STATUS_OFFSET = 6; // also at byte 6 of the 9-byte "50 3c" status poll
export const PERIOD1_OFFSET = 16; // uint32 LE — pulse channel 1 period (ticks)
export const PERIOD2_OFFSET = 24; // uint32 LE — pulse channel 2 period (ticks)
export const FREQ_HZ_OFFSET = 28; // uint32 LE — integer frequency in Hz

// PROVISIONAL tick rate: idle captures show period ≈ 640,227 ticks alongside
// freq-Hz ≈ 62 (mains noise on the floating input) → 640227 × 25 ns = 16.006 ms
// = 62.48 Hz. 40 MHz fits; confirm against a known meter frequency in the field.
export const PIU_TICK_HZ = 40_000_000;

function u32le(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

export const statusOf = (b: Uint8Array): number => b[STATUS_OFFSET];
/** Bit 7 of the status byte is SET while idle and CLEARED after a P5 launch. */
export const runActiveOf = (b: Uint8Array): boolean => (b[STATUS_OFFSET] & 0x80) === 0;
export const periodsOf = (b: Uint8Array): [number, number] => [u32le(b, PERIOD1_OFFSET), u32le(b, PERIOD2_OFFSET)];
export const freqHzOf = (b: Uint8Array): number => u32le(b, FREQ_HZ_OFFSET);
export const periodToHz = (ticks: number): number => (ticks > 0 ? PIU_TICK_HZ / ticks : 0);

export function isValidP4(b: Uint8Array): boolean {
  if (b.length !== P4_LEN || b[0] !== 0x01 || b[1] !== 0x50) return false;
  let s = 0;
  for (let i = 1; i < b.length - 1; i++) s = (s + b[i]) & 0xff;
  return s === b[b.length - 1];
}
export const counterOf = (b: Uint8Array): number => u32le(b, COUNTER_OFFSET);
export const fieldsOf = (b: Uint8Array): number[] => FIELD_OFFSETS.map((o) => u32le(b, o));

/** ADC counts → mA (validated: 20 mA ≈ 54,560 counts, floor ≈ 32). */
export const rawToMa = (raw: number): number => (raw - 21) / 2729;

// ── Configurable analog scaling (PROVEit "Analog Setup" model) ────────────────
export type AnalogSource = "Tp" | "Pp" | "Tm" | "Pm" | "none";

export interface AnalogInput {
  source: AnalogSource; // which proving value this input feeds
  channel: number; // P4 channel index 0..5
  zero: number; // engineering value at 4 mA
  span: number; // engineering value at 20 mA
  offset: number; // additive trim
  unit: string;
}

/** Default = exactly what PROVEit had configured on this unit (screenshots 2026-06-05). */
export const DEFAULT_ANALOG: AnalogInput[] = [
  { source: "Tp", channel: 0, zero: 32, span: 212, offset: -7, unit: "°F" },
  { source: "Pp", channel: 1, zero: 0, span: 300, offset: 0, unit: "psi" },
  { source: "Tm", channel: 0, zero: 32, span: 212, offset: -7, unit: "°F" },
  { source: "Pm", channel: 1, zero: 0, span: 300, offset: 0, unit: "psi" },
];

export function scaleInput(mA: number, inp: AnalogInput): number {
  return inp.zero + ((mA - 4) / 16) * (inp.span - inp.zero) + inp.offset;
}

export interface PiuReading {
  counter: number;
  channelMa: number[]; // 6 raw channels in mA
  // Scaled engineering values (whichever inputs are configured):
  Tp?: number;
  Pp?: number;
  Tm?: number;
  Pm?: number;
  // ── Run-layer fields (decoded from the Auto Run captures) ──────────────────
  frequencyHz?: number; // integer Hz from P4[28..31]
  periodHz?: number; // higher-resolution Hz derived from P4[16..19] period ticks
  proverState?: number; // raw status byte: 0x83 idle, 0x03 run-active
  runActive?: boolean; // bit7 of status cleared after launch
  // Still unmapped (needs a real prove with detector hits):
  pulses?: number;
  detectorClosed?: boolean;
}

/** Instantaneous reading from two P4 frames + an analog config. */
export function decodeP4Delta(
  f0: Uint8Array,
  f1: Uint8Array,
  analog: AnalogInput[] = DEFAULT_ANALOG,
): PiuReading | null {
  if (!isValidP4(f0) || !isValidP4(f1)) return null;
  const dc = counterOf(f1) - counterOf(f0);
  if (dc <= 0) return null;
  const a0 = fieldsOf(f0);
  const a1 = fieldsOf(f1);
  const ma = a1.map((v, i) => rawToMa((v - a0[i]) / dc));

  const out: PiuReading = { counter: counterOf(f1), channelMa: ma };
  const named = out as unknown as Record<string, number>;
  for (const inp of analog) {
    if (inp.source === "none") continue;
    const m = ma[inp.channel];
    if (m === undefined) continue;
    named[inp.source] = scaleInput(m, inp);
  }

  // Run layer: status + frequency straight from the newest frame.
  out.proverState = statusOf(f1);
  out.runActive = runActiveOf(f1);
  out.frequencyHz = freqHzOf(f1);
  const [p1] = periodsOf(f1);
  if (p1 > 0) out.periodHz = periodToHz(p1);

  return out;
}
