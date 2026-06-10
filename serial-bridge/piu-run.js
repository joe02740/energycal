'use strict';

/**
 * PIU run-watch — the field tool for the first real prove attempt.
 *
 *   node piu-run.js [COM_PORT] [BAUD]
 *
 * Polls P4 fast (like PROVEit's Auto Run does) and live-prints the decoded run
 * layer: status byte (idle/run-active), frequency channels, analog mA, and a
 * hex diff of any byte that changes outside the known fields — so the pulse
 * count reveals itself the moment a real prove produces detector hits.
 *
 * Keys:
 *   l  →  send LAUNCH (50 35) — asks for confirmation first. MOVES THE PROVER.
 *   d  →  toggle raw-diff printing
 *   q  →  quit
 *
 * Everything is logged to captures/piu-run-<stamp>.log for post-analysis.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { SerialPort } = require('serialport');

const PORT = process.argv[2] || 'COM6';
const BAUD = Number(process.argv[3] || 9600);

const P4_LEN = 121;
const CMD_P4 = Buffer.from([0x50, 0x34]);
const CMD_LAUNCH = Buffer.from([0x50, 0x35]);
const ACK_LAUNCH = Buffer.from([0x01, 0x50, 0x99, 0xe9]);
const TICK_HZ = 40e6; // provisional — see decode.ts

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
const u32 = (b, o) => b.readUInt32LE(o);

function validP4(b) {
  if (b.length !== P4_LEN || b[0] !== 0x01 || b[1] !== 0x50) return false;
  let s = 0;
  for (let i = 1; i < b.length - 1; i++) s = (s + b[i]) & 0xff;
  return s === b[b.length - 1];
}

const CAP = path.join(__dirname, 'captures');
fs.mkdirSync(CAP, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logPath = path.join(CAP, `piu-run-${stamp}.log`);
const log = fs.createWriteStream(logPath, { flags: 'a' });
const t0 = Date.now();
const logLine = (s) => log.write(`${((Date.now() - t0) / 1000).toFixed(3)} ${s}\n`);

const port = new SerialPort({ path: PORT, baudRate: BAUD, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false });

let acc = Buffer.alloc(0);
let prevFrame = null;
let baseFrame = null; // for Δ-accumulator decode
let showDiff = true;
let frames = 0;
let launchPending = false;

// Known/expected-to-change regions we do NOT report in the diff:
const KNOWN = new Set([120]); // checksum
for (let i = 56; i < 104; i++) KNOWN.add(i); // counter + analog accumulators
for (let i = 16; i < 32; i++) KNOWN.add(i); // period/freq fields (shown separately)
KNOWN.add(6); // status byte (shown separately)

function onFrame(f) {
  frames++;
  logLine(`P4 ${hex(f)}`);
  const status = f[6];
  const runActive = (status & 0x80) === 0;
  const period1 = u32(f, 16);
  const period2 = u32(f, 24);
  const freqHz = u32(f, 28);
  const counter = u32(f, 56);

  if (!baseFrame) baseFrame = f;
  const dc = counter - u32(baseFrame, 56);
  const ma = [];
  for (let k = 0; k < 6; k++) {
    const o = 60 + k * 8;
    const d = dc > 0 ? (u32(f, o) - u32(baseFrame, o)) / dc : 0;
    ma.push(((d - 21) / 2729).toFixed(2));
  }

  const line =
    `#${String(frames).padStart(5)}  status=0x${status.toString(16).padStart(2, '0')} ${runActive ? 'RUN-ACTIVE' : 'idle      '}` +
    `  f=${String(freqHz).padStart(4)}Hz  per1=${period1 ? (TICK_HZ / period1).toFixed(2) : '   0'}Hz  per2=${period2 ? (TICK_HZ / period2).toFixed(2) : '   0'}Hz` +
    `  mA[${ma.join(',')}]  ctr=${counter}`;
  process.stdout.write(`\r${line}   `);

  if (prevFrame && showDiff) {
    const changes = [];
    for (let i = 0; i < P4_LEN; i++) {
      if (KNOWN.has(i)) continue;
      if (f[i] !== prevFrame[i]) changes.push(`[${i}] ${prevFrame[i].toString(16).padStart(2, '0')}→${f[i].toString(16).padStart(2, '0')}`);
    }
    if (changes.length) {
      const msg = `\n  *** UNMAPPED BYTES CHANGED: ${changes.join('  ')}`;
      console.log(msg);
      logLine(msg.trim());
    }
  }
  prevFrame = f;
}

port.on('data', (d) => {
  acc = Buffer.concat([acc, d]);
  // launch ack first
  while (acc.length >= 4 && acc.subarray(0, 4).equals(ACK_LAUNCH)) {
    acc = acc.subarray(4);
    launchPending = false;
    console.log('\n  ✓ LAUNCH ACK received (01 50 99 e9) — RMU fired the launch output.');
    logLine('LAUNCH-ACK');
  }
  while (acc.length >= P4_LEN) {
    if (!(acc[0] === 0x01 && acc[1] === 0x50)) {
      const idx = acc.indexOf(0x01, 1);
      if (idx < 0) { acc = Buffer.alloc(0); return; }
      acc = acc.subarray(idx);
      continue;
    }
    const f = acc.subarray(0, P4_LEN);
    if (validP4(f)) { onFrame(Buffer.from(f)); acc = acc.subarray(P4_LEN); }
    else if (acc.subarray(0, 4).equals(ACK_LAUNCH)) {
      acc = acc.subarray(4);
      launchPending = false;
      console.log('\n  ✓ LAUNCH ACK received (01 50 99 e9).');
      logLine('LAUNCH-ACK');
    } else acc = acc.subarray(1);
  }
});

port.open((err) => {
  if (err) { console.error(`Cannot open ${PORT}: ${err.message}`); process.exit(1); }
  port.set({ dtr: true, rts: false }, () => {
    console.log(`PIU run-watch on ${PORT} @ ${BAUD} (DTR=1 RTS=0) — log: ${logPath}`);
    console.log('Keys:  l = LAUNCH (confirm)   d = toggle diff   q = quit\n');
    setInterval(() => port.write(CMD_P4), 250);
  });
});

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
let confirmArm = false;
process.stdin.on('keypress', (ch, key) => {
  const k = key?.name ?? ch;
  if (k === 'q' || (key?.ctrl && k === 'c')) { console.log('\nbye'); process.exit(0); }
  if (k === 'd') { showDiff = !showDiff; console.log(`\n  diff ${showDiff ? 'ON' : 'OFF'}`); return; }
  if (k === 'l') {
    if (!confirmArm) {
      confirmArm = true;
      console.log('\n  ⚠ LAUNCH will move the prover (4-way valve / sphere). Press l again within 5s to confirm.');
      setTimeout(() => { confirmArm = false; }, 5000);
      return;
    }
    confirmArm = false;
    launchPending = true;
    console.log('\n  → sending LAUNCH (50 35) …');
    logLine('LAUNCH-SENT');
    port.write(CMD_LAUNCH);
    setTimeout(() => { if (launchPending) console.log('\n  ✗ no launch ack within 3s'); }, 3000);
  }
});
