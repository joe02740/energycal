'use strict';

/**
 * Transaction timeline for a USBPcap capture of PROVEit ↔ RMU (PIU mode).
 *
 *   node piu-timeline.js <file.pcapng> [--cmd 35] [--p4diff]
 *
 * Pairs every OUT command (50 XX) with the IN bytes that follow it, with
 * timestamps, so protocol *events* (one-shot commands, response changes)
 * stand out from the steady polling. Modes:
 *   default   per-command summary + full timeline of NON-routine traffic
 *   --cmd XX  print every transaction for register XX with context
 *   --p4diff  diff consecutive P4 (50 34) responses, ignoring the known
 *             counter/accumulator fields — reveals state/detector bytes
 */

const fs = require('fs');

const FILE = process.argv[2] || '../proveit-capture.pcapng';
const args = process.argv.slice(3);
const CMD_FILTER = args.includes('--cmd') ? parseInt(args[args.indexOf('--cmd') + 1], 16) : null;
const P4DIFF = args.includes('--p4diff');

const buf = fs.readFileSync(FILE);

// ── pcapng walk (with timestamps) ────────────────────────────────────────────
const LINKTYPE_USBPCAP = 249;
const ifaceLink = [];
const packets = []; // { ts (µs), dev, dir, data }

let le = true;
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

let off = 0;
while (off + 12 <= buf.length) {
  const blockType = buf.readUInt32LE(off);
  const blockLen = u32(off + 4);
  if (blockLen < 12 || off + blockLen > buf.length) break;
  const bodyOff = off + 8;

  if (blockType === 0x0a0d0d0a) {
    le = buf.readUInt32LE(bodyOff) === 0x1a2b3c4d;
  } else if (blockType === 0x00000001) {
    ifaceLink.push(le ? buf.readUInt16LE(bodyOff) : buf.readUInt16BE(bodyOff));
  } else if (blockType === 0x00000006) {
    const ifaceId = u32(bodyOff);
    const tsHigh = u32(bodyOff + 4);
    const tsLow = u32(bodyOff + 8);
    const capLen = u32(bodyOff + 12);
    const dataOff = bodyOff + 20;
    if (ifaceLink[ifaceId] === LINKTYPE_USBPCAP) {
      const ts = tsHigh * 4294967296 + tsLow; // µs (default tsresol)
      parseUsbpcap(ts, buf.subarray(dataOff, dataOff + capLen));
    }
  }
  off += blockLen;
}

function parseUsbpcap(ts, pd) {
  if (pd.length < 27) return;
  const headerLen = pd.readUInt16LE(0);
  const device = pd.readUInt16LE(19);
  const endpoint = pd.readUInt8(21);
  const transfer = pd.readUInt8(22);
  const dataLength = pd.readUInt32LE(23);
  if (transfer !== 3 || dataLength === 0) return;
  const data = pd.subarray(headerLen, headerLen + dataLength);
  if (data.length === 0) return;
  packets.push({ ts, dev: device, dir: endpoint & 0x80 ? 'IN' : 'OUT', data: Buffer.from(data) });
}

// busiest device = the serial adapter
const tally = new Map();
for (const p of packets) tally.set(p.dev, (tally.get(p.dev) || 0) + p.data.length);
const target = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];

// ── Build transactions: OUT command → accumulated IN until the next OUT ──────
const tx = []; // { t0, cmd:[..], resp:Buffer, dt }
let cur = null;
const t0abs = packets.find((p) => p.dev === target)?.ts ?? 0;
for (const p of packets) {
  if (p.dev !== target) continue;
  if (p.dir === 'OUT') {
    if (cur) tx.push(cur);
    cur = { t0: (p.ts - t0abs) / 1e6, cmd: [...p.data], resp: [] };
  } else if (cur) {
    cur.resp.push(...p.data);
  }
}
if (cur) tx.push(cur);

const hex = (a, n = 999) => a.slice(0, n).map((x) => x.toString(16).padStart(2, '0')).join(' ');
const cmdName = (c) => (c.length >= 2 && c[0] === 0x50 ? `P${String.fromCharCode(c[1])} (50 ${c[1].toString(16)})` : `RAW ${hex(c)}`);

// ── Summary ──────────────────────────────────────────────────────────────────
const groups = new Map();
for (const t of tx) {
  const k = cmdName(t.cmd);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(t);
}
console.log(`Capture: ${FILE} — serial device ${target}, ${tx.length} transactions over ${(tx.at(-1).t0 - tx[0].t0).toFixed(1)}s\n`);
console.log('Command            count   t-first    t-last   resp-len(s)');
for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const lens = [...new Set(list.map((t) => t.resp.length))].sort((a, b) => a - b).join(',');
  console.log(`  ${k.padEnd(16)} ${String(list.length).padStart(5)}  ${list[0].t0.toFixed(2).padStart(8)}s ${list.at(-1).t0.toFixed(2).padStart(8)}s   [${lens}]`);
}

if (CMD_FILTER != null) {
  console.log(`\n── All transactions for register 0x${CMD_FILTER.toString(16)} — with ±3 neighbors ──`);
  tx.forEach((t, i) => {
    if (t.cmd[0] === 0x50 && t.cmd[1] === CMD_FILTER) {
      for (let j = Math.max(0, i - 3); j <= Math.min(tx.length - 1, i + 3); j++) {
        const m = j === i ? '→' : ' ';
        console.log(`${m} ${tx[j].t0.toFixed(3).padStart(9)}s  ${cmdName(tx[j].cmd).padEnd(14)}  resp[${tx[j].resp.length}]: ${hex(tx[j].resp, 24)}${tx[j].resp.length > 24 ? ' …' : ''}`);
      }
      console.log('');
    }
  });
}

if (P4DIFF) {
  console.log('\n── P4 response diffs (ignoring counter@56 + accumulators@60..103 and CHK) ──');
  const p4 = groups.get('P4 (50 34)') || [];
  const IGNORE = new Set();
  for (let i = 56; i < 104; i++) IGNORE.add(i);
  IGNORE.add(120); // checksum
  let prev = null;
  let shown = 0;
  for (const t of p4) {
    if (t.resp.length !== 121) continue;
    if (prev) {
      const changes = [];
      for (let i = 0; i < 121; i++) {
        if (IGNORE.has(i)) continue;
        if (t.resp[i] !== prev.resp[i]) changes.push(`[${i}] ${prev.resp[i].toString(16).padStart(2, '0')}→${t.resp[i].toString(16).padStart(2, '0')}`);
      }
      if (changes.length) {
        console.log(`  ${t.t0.toFixed(3).padStart(9)}s  ${changes.join('  ')}`);
        shown++;
      }
    }
    prev = t;
  }
  if (!shown) console.log('  (no non-accumulator byte ever changed)');
  // also dump the constant skeleton
  if (p4.length) {
    const f = p4.find((t) => t.resp.length === 121);
    console.log(`\n  First P4 frame (121B):\n  ${hex(f.resp)}`);
  }
}
