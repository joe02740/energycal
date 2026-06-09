'use strict';
// Verify the proposed PIU frame format across every captured response:
//   response = 01 50 <type> <payload...> <chk>,  chk = sum(bytes[1..n-2]) & 0xff
const fs = require('fs');
const FILE = process.argv[2] || 'proveit-capture.pcapng';
const buf = fs.readFileSync(FILE);

const ifaceLink = [];
const pkts = [];
let le = true;
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
let off = 0;
while (off + 12 <= buf.length) {
  const t = buf.readUInt32LE(off);
  const len = u32(off + 4);
  if (len < 12 || off + len > buf.length) break;
  const b = off + 8;
  if (t === 0x0a0d0d0a) le = buf.readUInt32LE(b) === 0x1a2b3c4d;
  else if (t === 0x00000001) ifaceLink.push(le ? buf.readUInt16LE(b) : buf.readUInt16BE(b));
  else if (t === 0x00000006) {
    const id = u32(b);
    const capLen = u32(b + 12);
    if (ifaceLink[id] === 249) {
      const pd = buf.subarray(b + 20, b + 20 + capLen);
      if (pd.length >= 27) {
        const hl = pd.readUInt16LE(0), dev = pd.readUInt16LE(19), ep = pd.readUInt8(21), tr = pd.readUInt8(22), dl = pd.readUInt32LE(23);
        if (tr === 3 && dl > 0) pkts.push({ dev, dir: ep & 0x80 ? 'IN' : 'OUT', data: pd.subarray(hl, hl + dl) });
      }
    }
  }
  off += len;
}
const total = new Map();
for (const p of pkts) total.set(p.dev, (total.get(p.dev) || 0) + p.data.length);
const target = [...total.entries()].sort((a, b) => b[1] - a[1])[0][0];

const runs = [];
for (const p of pkts) {
  if (p.dev !== target) continue;
  const last = runs[runs.length - 1];
  if (last && last.dir === p.dir) last.bytes.push(...p.data);
  else runs.push({ dir: p.dir, bytes: [...p.data] });
}
const responses = runs.filter((r) => r.dir === 'IN').map((r) => r.bytes);

let pass = 0, fail = 0;
const fails = [];
for (const r of responses) {
  if (r.length < 4 || r[0] !== 0x01 || r[1] !== 0x50) { fail++; if (fails.length < 5) fails.push(r); continue; }
  let sum = 0;
  for (let i = 1; i < r.length - 1; i++) sum = (sum + r[i]) & 0xff;
  if (sum === r[r.length - 1]) pass++;
  else { fail++; if (fails.length < 5) fails.push(r); }
}
console.log(`Responses: ${responses.length}`);
console.log(`Frame "01 50 … sum-checksum" PASS: ${pass}   FAIL: ${fail}`);
if (fails.length) {
  console.log('Sample failures:');
  for (const f of fails) console.log('  ' + f.map((x) => x.toString(16).padStart(2, '0')).join(' '));
}
console.log(pass === responses.length ? '\n✓ Checksum/format holds on EVERY response — protocol confirmed.' : '\n⚠ Some frames did not match — needs a tweak.');
