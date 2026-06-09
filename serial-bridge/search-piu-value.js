'use strict';
// Search every PIU response frame in a pcapng for a known value (e.g. 60.278 Hz),
// as float32 (LE/BE) or scaled int, to locate which register/offset carries it.
const fs = require('fs');
const FILE = process.argv[2];
const TARGETS = process.argv.slice(3).map(Number);
if (!FILE || !TARGETS.length) { console.log('usage: node search-piu-value.js <pcapng> <val1> [val2...]'); process.exit(1); }
const buf = fs.readFileSync(FILE);
const ifaceLink = []; const pkts = []; let le = true;
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
let off = 0;
while (off + 12 <= buf.length) {
  const t = buf.readUInt32LE(off); const len = u32(off + 4); if (len < 12 || off + len > buf.length) break; const b = off + 8;
  if (t === 0x0a0d0d0a) le = buf.readUInt32LE(b) === 0x1a2b3c4d;
  else if (t === 0x00000001) ifaceLink.push(le ? buf.readUInt16LE(b) : buf.readUInt16BE(b));
  else if (t === 0x00000006) { const id = u32(b); const capLen = u32(b + 12);
    if (ifaceLink[id] === 249) { const pd = buf.subarray(b + 20, b + 20 + capLen);
      if (pd.length >= 27) { const hl = pd.readUInt16LE(0), dev = pd.readUInt16LE(19), ep = pd.readUInt8(21), tr = pd.readUInt8(22), dl = pd.readUInt32LE(23);
        if (tr === 3 && dl > 0) pkts.push({ dev, dir: ep & 0x80 ? 'IN' : 'OUT', data: pd.subarray(hl, hl + dl) }); } } }
  off += len;
}
const totd = new Map(); for (const p of pkts) totd.set(p.dev, (totd.get(p.dev) || 0) + p.data.length);
const target = [...totd.entries()].sort((a, b) => b[1] - a[1])[0][0];
const runs = [];
for (const p of pkts) { if (p.dev !== target) continue; const last = runs[runs.length - 1]; if (last && last.dir === p.dir) last.bytes.push(...p.data); else runs.push({ dir: p.dir, bytes: [...p.data] }); }

const hex = (a) => a.map((x) => x.toString(16).padStart(2, '0')).join(' ');
function near(a, b) { return b !== 0 ? Math.abs(a - b) / Math.abs(b) < 0.01 : Math.abs(a) < 0.5; }

// search distinct responses per command
const seen = new Set();
let lastCmd = '?';
for (let i = 0; i < runs.length; i++) {
  if (runs[i].dir === 'OUT') { lastCmd = hex(runs[i].bytes); continue; }
  const r = Buffer.from(runs[i].bytes);
  const key = lastCmd + ':' + r.length;
  if (seen.has(key + ':' + hex([...r]).slice(0, 20))) continue;
  for (let o = 0; o + 4 <= r.length; o++) {
    const fLE = r.readFloatLE(o), fBE = r.readFloatBE(o);
    const u16 = r.readUInt16LE(o), u32v = r.readUInt32LE(o);
    for (const T of TARGETS) {
      const hits = [];
      if (Number.isFinite(fLE) && near(fLE, T)) hits.push(`f32LE=${fLE.toFixed(3)}`);
      if (Number.isFinite(fBE) && near(fBE, T)) hits.push(`f32BE=${fBE.toFixed(3)}`);
      if (u16 === Math.round(T) || u16 === Math.round(T * 10) || u16 === Math.round(T * 100) || u16 === Math.round(T * 1000)) hits.push(`u16=${u16}`);
      if (u32v === Math.round(T) || u32v === Math.round(T * 10) || u32v === Math.round(T * 100) || u32v === Math.round(T * 1000)) hits.push(`u32=${u32v}`);
      if (hits.length) console.log(`  CMD ${lastCmd}  off[${o}]  target ${T} → ${hits.join(' ')}    frame: ${hex([...r]).slice(0, 80)}`);
    }
  }
  seen.add(key + ':' + hex([...r]).slice(0, 20));
}
console.log('search done');
