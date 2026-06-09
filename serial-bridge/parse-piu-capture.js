'use strict';

/**
 * Extract the serial byte streams from a USBPcap .pcapng capture of PROVEit
 * talking to the RMU over the ATEN (Prolific) USB-serial adapter.
 *
 *   node parse-piu-capture.js <file.pcapng> [deviceAddr]
 *
 * Prints a per-device bulk-traffic summary, then for the busiest USB device
 * (the serial adapter) dumps the OUT (PROVEit→RMU) and IN (RMU→PROVEit) bulk
 * transfers in capture order, and writes reassembled streams to piu-out.bin /
 * piu-in.bin for further analysis.
 */

const fs = require('fs');
const path = require('path');

const FILE = process.argv[2] || 'proveit-capture.pcapng';
const FORCE_DEV = process.argv[3] !== undefined ? Number(process.argv[3]) : null;

const buf = fs.readFileSync(FILE);

// ── pcapng walk ───────────────────────────────────────────────────────────────
const LINKTYPE_USBPCAP = 249;
const ifaceLink = [];           // interfaceId -> linkType
const packets = [];             // { dev, dir:'IN'|'OUT', transfer, data:Buffer }

let le = true;
const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));

let off = 0;
while (off + 12 <= buf.length) {
  const blockType = buf.readUInt32LE(off); // SHB type is endian-neutral
  const blockLen = u32(off + 4);
  if (blockLen < 12 || off + blockLen > buf.length) break;
  const bodyOff = off + 8;

  if (blockType === 0x0a0d0d0a) {
    // Section Header Block — byte-order magic at body offset 0
    const magic = buf.readUInt32LE(bodyOff);
    le = magic === 0x1a2b3c4d;
  } else if (blockType === 0x00000001) {
    // Interface Description Block
    ifaceLink.push(le ? buf.readUInt16LE(bodyOff) : buf.readUInt16BE(bodyOff));
  } else if (blockType === 0x00000006) {
    // Enhanced Packet Block
    const ifaceId = u32(bodyOff);
    const capLen = u32(bodyOff + 12);
    const dataOff = bodyOff + 20;
    if (ifaceLink[ifaceId] === LINKTYPE_USBPCAP) {
      parseUsbpcap(buf.subarray(dataOff, dataOff + capLen));
    }
  }
  off += blockLen;
}

function parseUsbpcap(pd) {
  if (pd.length < 27) return;
  const headerLen = pd.readUInt16LE(0);
  const device = pd.readUInt16LE(19);
  const endpoint = pd.readUInt8(21);
  const transfer = pd.readUInt8(22);
  const dataLength = pd.readUInt32LE(23);
  if (transfer !== 3) return;            // bulk only
  if (dataLength === 0) return;
  const data = pd.subarray(headerLen, headerLen + dataLength);
  if (data.length === 0) return;
  packets.push({ dev: device, dir: endpoint & 0x80 ? 'IN' : 'OUT', data: Buffer.from(data) });
}

// ── Per-device summary ────────────────────────────────────────────────────────
const byDev = new Map();
for (const p of packets) {
  if (!byDev.has(p.dev)) byDev.set(p.dev, { in: 0, out: 0, n: 0 });
  const s = byDev.get(p.dev);
  s[p.dir === 'IN' ? 'in' : 'out'] += p.data.length;
  s.n++;
}
console.log('USB bulk traffic by device address:');
console.log('  dev   pkts   IN bytes   OUT bytes');
const devs = [...byDev.entries()].sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out));
for (const [dev, s] of devs) {
  console.log(`  ${String(dev).padStart(3)}  ${String(s.n).padStart(5)}  ${String(s.in).padStart(9)}  ${String(s.out).padStart(9)}`);
}

const target = FORCE_DEV != null ? FORCE_DEV : (devs[0] ? devs[0][0] : null);
if (target == null) { console.log('\nNo bulk USB traffic found.'); process.exit(0); }
console.log(`\n→ Treating device ${target} as the serial adapter (override: node parse-piu-capture.js ${FILE} <dev>)\n`);

// ── Reassemble + dump ─────────────────────────────────────────────────────────
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
const asc = (b) => [...b].map((x) => (x >= 0x20 && x < 0x7f ? String.fromCharCode(x) : '.')).join('');

const outChunks = [];
const inChunks = [];
console.log('Conversation (capture order) — OUT = PROVEit→RMU, IN = RMU→PROVEit:');
let line = 0;
for (const p of packets) {
  if (p.dev !== target) continue;
  (p.dir === 'IN' ? inChunks : outChunks).push(p.data);
  if (line < 400) {
    console.log(`  ${p.dir.padEnd(3)} [${String(p.data.length).padStart(3)}]  ${hex(p.data).slice(0, 96).padEnd(96)}  ${asc(p.data).slice(0, 32)}`);
  }
  line++;
}
if (line >= 400) console.log(`  … (${line} total bulk transfers; full streams written to files)`);

const outAll = Buffer.concat(outChunks);
const inAll = Buffer.concat(inChunks);
fs.writeFileSync(path.join(__dirname, 'piu-out.bin'), outAll);
fs.writeFileSync(path.join(__dirname, 'piu-in.bin'), inAll);
console.log(`\nReassembled: OUT ${outAll.length} bytes → piu-out.bin,  IN ${inAll.length} bytes → piu-in.bin`);
