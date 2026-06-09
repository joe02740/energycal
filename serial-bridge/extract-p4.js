'use strict';
// Pull P4 (50 34) field values out of a pcapng, to correlate with known mA.
const fs = require('fs');
const FILE = process.argv[2];
const buf = fs.readFileSync(FILE);
const ifaceLink = [];
const pkts = [];
let le = true;
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
let off = 0;
while (off + 12 <= buf.length) {
  const t = buf.readUInt32LE(off); const len = u32(off + 4);
  if (len < 12 || off + len > buf.length) break;
  const b = off + 8;
  if (t === 0x0a0d0d0a) le = buf.readUInt32LE(b) === 0x1a2b3c4d;
  else if (t === 0x00000001) ifaceLink.push(le ? buf.readUInt16LE(b) : buf.readUInt16BE(b));
  else if (t === 0x00000006) {
    const id = u32(b); const capLen = u32(b + 12);
    if (ifaceLink[id] === 249) {
      const pd = buf.subarray(b + 20, b + 20 + capLen);
      if (pd.length >= 27) { const hl = pd.readUInt16LE(0), dev = pd.readUInt16LE(19), ep = pd.readUInt8(21), tr = pd.readUInt8(22), dl = pd.readUInt32LE(23);
        if (tr === 3 && dl > 0) pkts.push({ dev, dir: ep & 0x80 ? 'IN' : 'OUT', data: pd.subarray(hl, hl + dl) }); }
    }
  }
  off += len;
}
const totd = new Map(); for (const p of pkts) totd.set(p.dev, (totd.get(p.dev) || 0) + p.data.length);
const target = [...totd.entries()].sort((a, b) => b[1] - a[1])[0][0];
const runs = [];
for (const p of pkts) { if (p.dev !== target) continue; const last = runs[runs.length - 1]; if (last && last.dir === p.dir) last.bytes.push(...p.data); else runs.push({ dir: p.dir, bytes: [...p.data] }); }
// P4 responses = IN runs of length 121 that follow an OUT run "50 34"
const p4 = [];
for (let i = 0; i < runs.length; i++) {
  if (runs[i].dir === 'OUT' && runs[i].bytes.length >= 2 && runs[i].bytes[0] === 0x50 && runs[i].bytes[1] === 0x34) {
    const r = runs[i + 1]; if (r && r.dir === 'IN' && r.bytes.length === 121) p4.push(Buffer.from(r.bytes));
  }
}
console.log(`${FILE}: ${p4.length} P4 frames`);
const FIELD = [60, 68, 76, 84, 92, 100];
const ctr = (f) => f.readUInt32LE(56);
const fields = (f) => FIELD.map((o) => f.readUInt32LE(o));
if (p4.length < 2) process.exit(0);
const a = p4[0], z = p4[p4.length - 1];
const dc = ctr(z) - ctr(a);
console.log(`counter ${ctr(a)} → ${ctr(z)} (Δ=${dc})\n  field  off   cumul(acc/count)   INSTANT(Δ/Δcount)`);
const fa = fields(a), fz = fields(z);
for (let i = 0; i < 6; i++) {
  const cumul = fz[i] / ctr(z);
  const inst = dc > 0 ? (fz[i] - fa[i]) / dc : NaN;
  console.log(`   ${i + 1}    [${String(FIELD[i]).padStart(3)}]  ${cumul.toFixed(1).padStart(12)}   ${inst.toFixed(1).padStart(14)}`);
}
