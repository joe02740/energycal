'use strict';

/**
 * One-command prove-capture analyzer — run this on Monday's data.
 *
 *   node decode-prove.js <butane-prove.pcapng | captures/piu-run-*.log> [--kfactor N] [--provervol GAL]
 *
 * Accepts either a Wireshark/USBPcap capture of PROVEit running the prove, or
 * a piu-run.js log. It:
 *   1. finds every LAUNCH (50 35) and segments the capture into passes,
 *   2. inside each pass, tracks every byte of P4 outside the known map,
 *   3. ranks uint32/uint16 candidates that COUNT UP during the pass (pulse
 *      counters count; noise doesn't),
 *   4. if --kfactor (pulses/gal) and --provervol (gal) are given, flags the
 *      candidate whose final value ≈ K × V — that's the field.
 *
 * Output ends with the exact RunFieldMap line to drop into the app.
 */

const fs = require('fs');

const FILE = process.argv[2];
if (!FILE) { console.error('usage: node decode-prove.js <capture.pcapng | piu-run.log> [--kfactor N] [--provervol GAL]'); process.exit(1); }
const args = process.argv.slice(3);
const KFACTOR = args.includes('--kfactor') ? parseFloat(args[args.indexOf('--kfactor') + 1]) : null;
const PROVERVOL = args.includes('--provervol') ? parseFloat(args[args.indexOf('--provervol') + 1]) : null;

const P4_LEN = 121;
const KNOWN = new Set([6, 120]);
for (let i = 16; i < 32; i++) KNOWN.add(i); // period/freq (tracked separately)
for (let i = 56; i < 104; i++) KNOWN.add(i); // counter + analog accumulators

const hex2 = (x) => x.toString(16).padStart(2, '0');
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b, o) => b[o] | (b[o + 1] << 8);

function validP4(b) {
  if (b.length !== P4_LEN || b[0] !== 0x01 || b[1] !== 0x50) return false;
  let s = 0;
  for (let i = 1; i < b.length - 1; i++) s = (s + b[i]) & 0xff;
  return s === b[b.length - 1];
}

// ── Load events: [{t, kind:'launch'|'p4', frame?}] from either source ────────
const events = [];
const raw = fs.readFileSync(FILE);

if (raw.length > 8 && raw.readUInt32LE(0) === 0x0a0d0d0a) {
  // pcapng — walk USBPcap bulk transfers (same scheme as piu-timeline.js)
  const LINKTYPE_USBPCAP = 249;
  const ifaceLink = [];
  let le = true;
  const ru32 = (o) => (le ? raw.readUInt32LE(o) : raw.readUInt32BE(o));
  const packets = [];
  let off = 0;
  while (off + 12 <= raw.length) {
    const blockType = raw.readUInt32LE(off);
    const blockLen = ru32(off + 4);
    if (blockLen < 12 || off + blockLen > raw.length) break;
    const bodyOff = off + 8;
    if (blockType === 0x0a0d0d0a) le = raw.readUInt32LE(bodyOff) === 0x1a2b3c4d;
    else if (blockType === 0x00000001) ifaceLink.push(le ? raw.readUInt16LE(bodyOff) : raw.readUInt16BE(bodyOff));
    else if (blockType === 0x00000006) {
      const ifaceId = ru32(bodyOff);
      const ts = ru32(bodyOff + 4) * 4294967296 + ru32(bodyOff + 8);
      const capLen = ru32(bodyOff + 12);
      const pd = raw.subarray(bodyOff + 20, bodyOff + 20 + capLen);
      if (ifaceLink[ifaceId] === LINKTYPE_USBPCAP && pd.length >= 27) {
        const headerLen = pd.readUInt16LE(0);
        const device = pd.readUInt16LE(19);
        const endpoint = pd.readUInt8(21);
        const transfer = pd.readUInt8(22);
        const dataLength = pd.readUInt32LE(23);
        if (transfer === 3 && dataLength > 0) {
          packets.push({ ts, dev: device, dir: endpoint & 0x80 ? 'IN' : 'OUT', data: Buffer.from(pd.subarray(headerLen, headerLen + dataLength)) });
        }
      }
    }
    off += blockLen;
  }
  const tally = new Map();
  for (const p of packets) tally.set(p.dev, (tally.get(p.dev) || 0) + p.data.length);
  const target = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const t0 = packets.find((p) => p.dev === target)?.ts ?? 0;
  let acc = Buffer.alloc(0);
  for (const p of packets) {
    if (p.dev !== target) continue;
    const t = (p.ts - t0) / 1e6;
    if (p.dir === 'OUT') {
      for (let i = 0; i + 1 < p.data.length; i += 2) {
        if (p.data[i] === 0x50 && p.data[i + 1] === 0x35) events.push({ t, kind: 'launch' });
      }
    } else {
      acc = Buffer.concat([acc, p.data]);
      while (acc.length >= P4_LEN) {
        if (!(acc[0] === 0x01 && acc[1] === 0x50)) {
          const idx = acc.indexOf(0x01, 1);
          if (idx < 0) { acc = Buffer.alloc(0); break; }
          acc = acc.subarray(idx);
          continue;
        }
        const f = acc.subarray(0, P4_LEN);
        if (validP4(f)) { events.push({ t, kind: 'p4', frame: Buffer.from(f) }); acc = acc.subarray(P4_LEN); }
        else acc = acc.subarray(1);
      }
    }
  }
} else {
  // piu-run.js log: "<t> P4 <hex...>" / "<t> LAUNCH-SENT"
  for (const line of raw.toString('utf8').split('\n')) {
    const m = line.match(/^([\d.]+) (P4|LAUNCH-SENT|LAUNCH-ACK)( (.*))?$/);
    if (!m) continue;
    const t = parseFloat(m[1]);
    if (m[2] === 'LAUNCH-SENT') events.push({ t, kind: 'launch' });
    else if (m[2] === 'P4' && m[4]) {
      const f = Buffer.from(m[4].trim().split(/\s+/).map((h) => parseInt(h, 16)));
      if (validP4(f)) events.push({ t, kind: 'p4', frame: f });
    }
  }
}

const launches = events.filter((e) => e.kind === 'launch');
const frames = events.filter((e) => e.kind === 'p4');
console.log(`${FILE}: ${frames.length} valid P4 frames, ${launches.length} launch command(s)\n`);
if (!frames.length) { console.log('No P4 frames found.'); process.exit(1); }

// ── Segment passes: launch → (next launch | end) ─────────────────────────────
const passes = launches.map((l, i) => ({
  n: i + 1,
  t0: l.t,
  t1: launches[i + 1]?.t ?? Infinity,
  frames: frames.filter((f) => f.t > l.t && f.t < (launches[i + 1]?.t ?? Infinity)),
}));
if (!passes.length) {
  console.log('No launches found — analyzing the full capture as one window.');
  passes.push({ n: 1, t0: 0, t1: Infinity, frames });
}

const expected = KFACTOR && PROVERVOL ? KFACTOR * PROVERVOL : null;
if (expected) console.log(`Expected pulses/pass ≈ K × V = ${KFACTOR} × ${PROVERVOL} = ${Math.round(expected)}\n`);

const tallies = new Map(); // offset -> { passes:n, monotonic:n, finals:[] }

for (const pass of passes) {
  if (pass.frames.length < 3) { console.log(`Pass ${pass.n}: only ${pass.frames.length} frames — skipped`); continue; }
  const first = pass.frames[0].frame;
  const lastF = pass.frames.at(-1).frame;
  console.log(`── Pass ${pass.n}  (t=${pass.t0.toFixed(1)}s → ${pass.t1 === Infinity ? 'end' : pass.t1.toFixed(1) + 's'}, ${pass.frames.length} frames)`);
  console.log(`   status: ${[...new Set(pass.frames.map((f) => hex2(f.frame[6])))].join(' → ')}`);

  // changed bytes outside the known map
  const changed = new Set();
  for (const f of pass.frames) for (let i = 0; i < P4_LEN; i++) {
    if (!KNOWN.has(i) && f.frame[i] !== first[i]) changed.add(i);
  }
  if (!changed.size) { console.log('   no unmapped bytes changed (pass never measured?)\n'); continue; }

  // group consecutive offsets into fields, test u32/u16 monotonicity
  const offs = [...changed].sort((a, b) => a - b);
  const fields = [];
  let s = offs[0], p = offs[0];
  for (let i = 1; i <= offs.length; i++) {
    if (offs[i] === p + 1) { p = offs[i]; continue; }
    fields.push([s, p]);
    s = offs[i]; p = offs[i];
  }
  for (const [a, b] of fields) {
    const base = Math.max(0, Math.min(a, P4_LEN - 4));
    // a u32 window that crosses into known fields (counter/accumulators/freq)
    // reads garbage growth from those — flag it and keep it out of the verdict
    const overlapsKnown = [0, 1, 2, 3].some((k) => KNOWN.has(base + k));
    const series = pass.frames.map((f) => u32(f.frame, base));
    const mono = series.every((v, i) => i === 0 || v >= series[i - 1]);
    const delta = series.at(-1) - series[0];
    const s16 = pass.frames.map((f) => u16(f.frame, base));
    const d16 = s16.at(-1) - s16[0];
    console.log(
      `   bytes [${a}..${b}] → u32@${base}: ${series[0]} → ${series.at(-1)} (Δ${delta})${mono ? ' MONOTONIC ▲' : ''}` +
      `  | u16@${base}: Δ${d16}` +
      (overlapsKnown ? '  | ⚠ window overlaps known fields — flag byte, not a counter' : '') +
      (expected && delta > 0 ? `  | vs expected: ${(delta / expected * 100).toFixed(1)}%` : ''),
    );
    if (overlapsKnown) continue;
    const t = tallies.get(base) ?? { passes: 0, monotonic: 0, finals: [] };
    t.passes++;
    if (mono && delta > 0) t.monotonic++;
    t.finals.push(delta);
    tallies.set(base, t);
  }
  console.log(`   end-of-pass frame: ${[...lastF].map(hex2).join(' ')}\n`);
}

// ── Verdict ──────────────────────────────────────────────────────────────────
const ranked = [...tallies.entries()]
  .filter(([, t]) => t.monotonic > 0)
  .sort((a, b) => b[1].monotonic - a[1].monotonic || (expected ? Math.abs(a[1].finals[0] - expected) - Math.abs(b[1].finals[0] - expected) : 0));
if (ranked.length) {
  const [best, t] = ranked[0];
  console.log(`VERDICT: pulse-count field ≈ uint32 LE @ offset ${best} (monotonic in ${t.monotonic}/${t.passes} passes; Δ per pass: ${t.finals.join(', ')})`);
  console.log(`\nDrop into the app (src/lib/piu/piuRs232Controller.ts):`);
  console.log(`  DEFAULT_RUN_FIELD_MAP.pulseOffset = ${best};`);
} else {
  console.log('VERDICT: no monotonic counter found outside the known map — check the pass actually measured (detector hits), or send me this output.');
}
