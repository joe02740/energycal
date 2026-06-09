'use strict';
// Diff first vs last P4 frame to find EVERY field that changes (analog accumulators
// AND any pulse/count accumulators), as uint32 LE per 4-byte word.
const fs = require('fs');
const FILE = process.argv[2];
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
const tgt = [...totd.entries()].sort((a, b) => b[1] - a[1])[0][0];
const runs = [];
for (const p of pkts) { if (p.dev !== tgt) continue; const last = runs[runs.length - 1]; if (last && last.dir === p.dir) last.bytes.push(...p.data); else runs.push({ dir: p.dir, bytes: [...p.data] }); }
const p4 = [];
for (let i = 0; i < runs.length; i++) if (runs[i].dir === 'OUT' && runs[i].bytes[0] === 0x50 && runs[i].bytes[1] === 0x34) { const r = runs[i + 1]; if (r && r.dir === 'IN' && r.bytes.length === 121) p4.push(Buffer.from(r.bytes)); }
const a = p4[0], z = p4[p4.length - 1];
const ctr = (f) => f.readUInt32LE(56);
const dc = ctr(z) - ctr(a);
console.log(`${p4.length} P4 frames, counter ${ctr(a)}→${ctr(z)} (Δ=${dc})`);
console.log('Per 4-byte word — only words that CHANGED:');
console.log('  off   first        last         Δ           Δ/Δcount');
for (let o = 0; o + 4 <= 121; o += 4) {
  const v0 = a.readUInt32LE(o), v1 = z.readUInt32LE(o);
  if (v0 !== v1) {
    const d = v1 - v0;
    console.log(`  [${String(o).padStart(3)}]  ${String(v0).padStart(10)}  ${String(v1).padStart(10)}  ${String(d).padStart(10)}  ${(d / dc).toFixed(2).padStart(10)}`);
  }
}
console.log('\nfull last frame:');
console.log('  ' + [...z].map((x) => x.toString(16).padStart(2, '0')).join(' '));
