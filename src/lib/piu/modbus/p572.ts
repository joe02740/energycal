// Pure Newflow P572 RMU (NANO RTU2) Modbus helpers.
//
// NO Node APIs here — this module is imported by BOTH the browser controller and
// the server route, so it must stay isomorphic. Socket I/O lives in tcpClient.ts
// (server-only).
//
// Register facts are from p572-docs/ (P572 Modbus Address Map, NF_P572RTU2_MAM/R0):
//   Legacy Float32 map (direct engineering values, no prescaler):
//     1000 Freq A (Hz), 1002 Freq B, 1004 Freq C/RAWIN,
//     1006/1008 Density 1/2 period (µs), 1010..1020 Analogue Input 1..6.
//   Scaled Int32 map:
//     2008 System Status, 2010 Digital Inputs (bit 8 = DI9 Detector switch),
//     2012 Prover Status (0..8), 2014 FPGA Message Count (~2 Hz alive tick),
//     2018 Good/A pulse count, 2030 Prover PULSEIN SW1-2 Count (per-pass pulses).
//
// 32-bit values span two 16-bit Modbus registers, hi-word first, big-endian
// (the manual's "3210" order). Verified against the manual's worked example
// 45 79 FE D6 = 3999.927 Hz.

import type { PiuLiveSample } from "../controller";

export const P572_TCP_PORT = 502;
export const P572_DEFAULT_UNIT = 1;

export interface RegBlock {
  start: number;
  qty: number;
}

// The two blocks we read each poll for live data.
export const BLOCKS = {
  floats: { start: 1000, qty: 22 } as RegBlock, // 1000..1021 → 11 Float32 values
  scaled: { start: 2008, qty: 24 } as RegBlock, // 2008..2031 → status, counts, prover pulse
} as const;

export const PROVER_STATES: Record<number, string> = {
  0: "Waiting for Start",
  1: "Waiting SS1 rising edge",
  2: "SS1 up, waiting PULSEIN",
  3: "Waiting SS1 falling edge",
  4: "SS1 fell, no pulse seen",
  5: "Waiting SS2",
  6: "SS2 up, waiting PULSEIN N+1",
  7: "Done",
  8: "Abort",
};

export interface P572Reading {
  freqA: number;
  freqB: number;
  freqC: number;
  density1Us: number;
  density2Us: number;
  anInMa: number[]; // AnIn1..6 as reported (mA for 4-20mA channels)
  systemStatus: number;
  digitalInputs: number; // bits 0..8 = DI1..DI9
  detectorClosed: boolean; // DI9 (bit 8) — detector / sphere switch
  proverStatus: number;
  proverStateText: string;
  messageId: number; // advances ~2 Hz while the RMU is alive
  goodPulseCount: number;
  proverPulseSw1Sw2: number; // reg 2030 — pulses between detector switches (per pass)
}

// ── Register / byte helpers (big-endian, hi-word first) ───────────────────────
function u32(hi: number, lo: number): number {
  return ((((hi & 0xffff) << 16) >>> 0) | (lo & 0xffff)) >>> 0;
}
function asFloat32(v: number): number {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setUint32(0, v >>> 0, false);
  return dv.getFloat32(0, false);
}
function regFloat(regs: number[], start: number, addr: number): number {
  const i = addr - start;
  return asFloat32(u32(regs[i], regs[i + 1]));
}
function regU32(regs: number[], start: number, addr: number): number {
  const i = addr - start;
  return u32(regs[i], regs[i + 1]);
}

/** Decode a 32-bit big-endian float from its two Modbus registers (exported for tests). */
export function decodeFloat32(hi: number, lo: number): number {
  return asFloat32(u32(hi, lo));
}

export function decodeReading(blocks: { floats: number[]; scaled: number[] }): P572Reading {
  const f = blocks.floats;
  const s = blocks.scaled;
  const fs = BLOCKS.floats.start;
  const ss = BLOCKS.scaled.start;

  const digitalInputs = regU32(s, ss, 2010);
  const proverStatus = regU32(s, ss, 2012);

  return {
    freqA: regFloat(f, fs, 1000),
    freqB: regFloat(f, fs, 1002),
    freqC: regFloat(f, fs, 1004),
    density1Us: regFloat(f, fs, 1006),
    density2Us: regFloat(f, fs, 1008),
    anInMa: [
      regFloat(f, fs, 1010),
      regFloat(f, fs, 1012),
      regFloat(f, fs, 1014),
      regFloat(f, fs, 1016),
      regFloat(f, fs, 1018),
      regFloat(f, fs, 1020),
    ],
    systemStatus: regU32(s, ss, 2008),
    digitalInputs,
    detectorClosed: (digitalInputs & (1 << 8)) !== 0,
    proverStatus,
    proverStateText: PROVER_STATES[proverStatus] ?? `state ${proverStatus}`,
    messageId: regU32(s, ss, 2014),
    goodPulseCount: regU32(s, ss, 2018),
    proverPulseSw1Sw2: regU32(s, ss, 2030),
  };
}

// ── 4-20mA → engineering scaling ──────────────────────────────────────────────
// The RMU reports analog inputs as mA; PROVEit applies a per-channel linear
// 4-20mA → engineering-units map. Provide one of these per channel to turn raw
// mA into Tm/Pm/Tp/Pp. Ranges are site config (come from the meter/prover setup).
export interface ChannelScale {
  anIn: number; // 1..6 (which Analogue Input feeds this value)
  maMin: number; // e.g. 4
  maMax: number; // e.g. 20
  engMin: number; // engineering value at maMin
  engMax: number; // engineering value at maMax
}

export interface ChannelMap {
  meterTempF?: ChannelScale;
  meterPressurePsig?: ChannelScale;
  proverTempF?: ChannelScale;
  proverPressurePsig?: ChannelScale;
}

export function scaleMa(ma: number, s: ChannelScale): number {
  const span = s.maMax - s.maMin;
  const t = span === 0 ? 0 : (ma - s.maMin) / span;
  return s.engMin + t * (s.engMax - s.engMin);
}

/** Map a raw reading into the PiuLiveSample shape the wizard/UI consumes. */
export function toLiveSample(r: P572Reading, map?: ChannelMap): PiuLiveSample {
  const out: PiuLiveSample = { frequencyHz: r.freqA, pulses: r.proverPulseSw1Sw2 };
  const apply = (sc?: ChannelScale): number | undefined => {
    if (!sc) return undefined;
    const ma = r.anInMa[sc.anIn - 1];
    if (ma === undefined) return undefined;
    const v = scaleMa(ma, sc);
    return Number.isFinite(v) ? v : undefined;
  };
  const mt = apply(map?.meterTempF);
  if (mt !== undefined) out.meterTempF = mt;
  const mp = apply(map?.meterPressurePsig);
  if (mp !== undefined) out.meterPressurePsig = mp;
  const pt = apply(map?.proverTempF);
  if (pt !== undefined) out.proverTempF = pt;
  const pp = apply(map?.proverPressurePsig);
  if (pp !== undefined) out.proverPressurePsig = pp;
  return out;
}

// ── Modbus framing (pure — used by the server client and the tests) ───────────
export function modbusCrc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

export function buildReadPdu(addr: number, qty: number): Uint8Array {
  return new Uint8Array([0x03, (addr >> 8) & 0xff, addr & 0xff, (qty >> 8) & 0xff, qty & 0xff]);
}

export function buildTcpFrame(txn: number, unitId: number, pdu: Uint8Array): Uint8Array {
  const f = new Uint8Array(7 + pdu.length);
  const dv = new DataView(f.buffer);
  dv.setUint16(0, txn & 0xffff, false); // transaction id
  dv.setUint16(2, 0, false); // protocol id
  dv.setUint16(4, 1 + pdu.length, false); // length (unit id + pdu)
  f[6] = unitId & 0xff;
  f.set(pdu, 7);
  return f;
}

export function buildRtuFrame(unitId: number, addr: number, qty: number): Uint8Array {
  const pdu = buildReadPdu(addr, qty);
  const body = new Uint8Array(1 + pdu.length);
  body[0] = unitId & 0xff;
  body.set(pdu, 1);
  const crc = modbusCrc16(body);
  const frame = new Uint8Array(body.length + 2);
  frame.set(body, 0);
  frame[body.length] = crc & 0xff;
  frame[body.length + 1] = (crc >> 8) & 0xff;
  return frame;
}

/** Big-endian 16-bit registers from a byte buffer (the FC03 data field). */
export function registersFromBytes(data: Uint8Array): number[] {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: number[] = [];
  for (let i = 0; i + 1 < data.length; i += 2) out.push(dv.getUint16(i, false));
  return out;
}
