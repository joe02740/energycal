'use strict';

/**
 * Transaction-level analysis of a PIU capture. Merges the byte-by-byte serial
 * stream into OUT-runs (commands) and IN-runs (responses), pairs them, and
 * reports: distinct commands, distinct responses per command, per-byte
 * variation (live vs constant), and the opening handshake.
 *
 *   node analyze-piu-transactions.js <file.pcapng> [deviceAddr]
 */

const fs = require('fs');

const FILE = process.argv[2] || 'proveit-capture.pcapng';
const FORCE_DEV = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const buf = fs.readFileSync(FILE);

// ── pcapng → ordered bulk packets for the serial device ───────────────────────
const ifaceLink = [];
const pkts = [];
let le = true;
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
let off = 0;
while (off + 12 <= buf.length) {
  const blockType = buf.readUInt32LE(off);
  const blockLen = u32(off + 4);
  if (blockLen < 12 || off + blockLen > buf.length) break;
  const b = off + 8;
  if (blockType === 0x0a0d0d0a) le = buf.readUInt32LE(b) === 0x1a2b3c4d;
  else if (blockType === 0x00000001) ifaceLink.push(le ? buf.readUInt16LE(b) : buf.readUInt16BE(b));
  else if (blockType === 0x00000006) {
    const ifaceId = u32(b);
    const capLen = u32(b + 12);
    if (ifaceLink[ifaceId] === 249) {
      const pd = buf.subarray(b + 20, b + 20 + capLen);
      if (pd.length >= 27) {
        const headerLen = pd.readUInt16LE(0);
        const dev = pd.readUInt16LE(19);
        const endpoint = pd.readUInt8(21);
        const transfer = pd.readUInt8(22);
        const dataLength = pd.readUInt32LE(23);
        if (transfer === 3 && dataLength > 0) {
          pkts.push({ dev, dir: endpoint & 0x80 ? 'IN' : 'OUT', data: pd.subarray(headerLen, headerLen + dataLength) });
        }
      }
    }
  }
  off += blockLen;
}

// pick busiest device
const tot = new Map();
for (const p of pkts) tot.set(p.dev, (tot.get(p.dev) || 0) + p.data.length);
const target = FORCE_DEV != null ? FORCE_DEV : [...tot.entries()].sort((a, b) => b[1] - a[1])[0][0];

// ── Merge into same-direction runs ────────────────────────────────────────────
const runs = [];
for (const p of pkts) {
  if (p.dev !== target) continue;
  const last = runs[runs.length - 1];
  if (last && last.dir === p.dir) last.bytes.push(...p.data);
  else runs.push({ dir: p.dir, bytes: [...p.data] });
}

// ── Pair OUT-run → following IN-run into transactions ─────────────────────────
const hex = (a) => a.map((x) => x.toString(16).padStart(2, '0')).join(' ');
const txns = [];
for (let i = 0; i < runs.length; i++) {
  if (runs[i].dir === 'OUT') {
    const resp = runs[i + 1] && runs[i + 1].dir === 'IN' ? runs[i + 1].bytes : [];
    txns.push({ cmd: runs[i].bytes, resp });
  }
}

console.log(`Device ${target}: ${runs.length} runs, ${txns.length} OUT→IN transactions\n`);

// Distinct commands
const cmdCounts = new Map();
for (const t of txns) {
  const k = hex(t.cmd);
  cmdCounts.set(k, (cmdCounts.get(k) || 0) + 1);
}
console.log('Distinct commands (OUT) and counts:');
for (const [k, n] of [...cmdCounts.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)} ×  [${k.split(' ').length}b]  ${k}`);
}

// Distinct responses per command + length histogram
console.log('\nResponses grouped by command:');
for (const [cmdKey] of [...cmdCounts.entries()].sort((a, b) => b[1] - a[1])) {
  const responses = txns.filter((t) => hex(t.cmd) === cmdKey).map((t) => t.resp);
  const respCounts = new Map();
  const lenCounts = new Map();
  for (const r of responses) {
    respCounts.set(hex(r), (respCounts.get(hex(r)) || 0) + 1);
    lenCounts.set(r.length, (lenCounts.get(r.length) || 0) + 1);
  }
  console.log(`\n  CMD ${cmdKey}  (${responses.length} times)`);
  console.log(`    response lengths: ${[...lenCounts.entries()].map(([l, c]) => `${l}b×${c}`).join(', ')}`);
  console.log(`    ${respCounts.size} distinct response(s); top:`);
  for (const [r, n] of [...respCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
    console.log(`      ${String(n).padStart(4)} ×  ${r}`);
  }
  // per-byte variation for the dominant response length
  const domLen = [...lenCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sameLen = responses.filter((r) => r.length === domLen);
  if (domLen > 0 && sameLen.length > 1) {
    console.log(`    per-byte variation across ${sameLen.length} responses of length ${domLen}:`);
    let lineParts = [];
    for (let pos = 0; pos < domLen; pos++) {
      const vals = new Set(sameLen.map((r) => r[pos]));
      if (vals.size === 1) lineParts.push(`[${pos}]=${[...vals][0].toString(16).padStart(2, '0')}`);
      else {
        const arr = [...vals].sort((a, b) => a - b);
        lineParts.push(`[${pos}]=VAR{${arr.length}:${arr[0].toString(16).padStart(2, '0')}..${arr[arr.length - 1].toString(16).padStart(2, '0')}}`);
      }
    }
    console.log('      ' + lineParts.join(' '));
  }
}

// Opening handshake
console.log('\nFirst 24 transactions (the connect/handshake):');
for (let i = 0; i < Math.min(24, txns.length); i++) {
  console.log(`  ${String(i).padStart(2)}  CMD ${hex(txns[i].cmd).padEnd(20)} → ${hex(txns[i].resp)}`);
}
