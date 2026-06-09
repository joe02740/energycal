'use strict';

/**
 * Newflow P572 RMU (NANO RTU2) — Modbus poller.
 *
 * Use this when the RMU is in RTU mode (front-panel rotary switch SW1 in a
 * position 1-9 / C / D — NOT 0/F/E which is PIU mode). Reads the documented
 * register map and prints live values once a second. No browser, no dev server,
 * no extra npm installs (Modbus is hand-rolled on Node's built-in `net` for TCP
 * and the bundled `serialport` for RTU).
 *
 * USAGE
 *   node modbus.js tcp <ip> [unitId=1] [intervalMs=1000]      # Ethernet, NO WIRING
 *   node modbus.js rtu <COMport> [baud=19200] [unitId=1]      # RS485/RS422 serial
 *   node modbus.js selftest                                   # offline frame/CRC check
 *
 * EXAMPLES
 *   node modbus.js tcp 10.255.255.255        # direct-connect fallback IP
 *   node modbus.js tcp 192.168.1.50 1 500    # poll twice a second
 *   node modbus.js rtu COM5 19200 1          # if you have an RS485 adapter on COM2
 *
 * SW1 reminder: C = RTU full web + Modbus addr 1 (easiest); 1-9 = RTU Modbus addr
 * N; 0 = back to PIU mode for PROVEit. Power-cycle the RMU after changing SW1.
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const MODE = (args[0] || 'tcp').toLowerCase();

// ── Modbus CRC-16 (RTU) ───────────────────────────────────────────────────────
function crc16(buf) {
  let crc = 0xffff;
  for (const b of buf) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

// FC03 Read Holding Registers PDU
function readPDU(addr, qty) {
  return Buffer.from([0x03, (addr >> 8) & 0xff, addr & 0xff, (qty >> 8) & 0xff, qty & 0xff]);
}

// ── Register map (P572 RTU2) ──────────────────────────────────────────────────
// Legacy Float32 block (1000..) — direct engineering values, no prescaler needed.
const FLOAT_BLOCK = { start: 1000, qty: 22 };
const FLOATS = [
  [1000, 'Freq A (Hz)'],          // Good / A frequency  — flow-meter pulse freq
  [1002, 'Freq B (Hz)'],
  [1004, 'Freq C/RAWIN (Hz)'],
  [1006, 'Density1 period (us)'],
  [1008, 'Density2 period (us)'],
  [1010, 'AnIn1 (mA)'],           // PROVEit Channel 0 — typically Meter Temp
  [1012, 'AnIn2 (mA)'],           // Channel 1 — typically Meter Pressure
  [1014, 'AnIn3 (mA)'],           // Channel 2 — typically Prover Temp
  [1016, 'AnIn4 (mA)'],           // Channel 3 — typically Prover Pressure
  [1018, 'AnIn5/PRT2'],
  [1020, 'AnIn6/PRT1'],
];

// Scaled Int32 status block (2008..2015) — status/counts, no scaling needed.
const STATUS_BLOCK = { start: 2008, qty: 8 };
const PROVER_STATES = {
  0: 'Waiting for Start', 1: 'Waiting SS1 rising', 2: 'SS1 up, waiting PULSEIN',
  3: 'waiting SS1 falling', 4: 'SS1 fell, no pulse', 5: 'waiting SS2',
  6: 'SS2 up, waiting PULSEIN N+1', 7: 'Done', 8: 'Abort',
};
function decodeDigIns(v) {
  const names = ['DI1', 'DI2', 'DI3', 'DI4', 'DI5(Fault)', 'DI6(Leak)', 'DI7(PrvRdy)', 'DI8(PulseSel)', 'DI9(Detector)'];
  const on = [];
  for (let i = 0; i <= 8; i++) if (v & (1 << i)) on.push(names[i]);
  return on.length ? on.join(' ') : '(none)';
}

// ── Capture log ───────────────────────────────────────────────────────────────
const CAP_DIR = path.join(__dirname, 'captures');
fs.mkdirSync(CAP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logPath = path.join(CAP_DIR, `modbus-${MODE}-${stamp}.log`);
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
function logln(s = '') { logStream.write(s + '\n'); }

// ── Decode + print one poll ───────────────────────────────────────────────────
function render(floatBuf, statusBuf) {
  const lines = [];
  const ts = new Date().toISOString().slice(11, 19);
  lines.push(`── ${ts} ─────────────────────────────`);
  if (floatBuf) {
    for (const [addr, name] of FLOATS) {
      const off = (addr - FLOAT_BLOCK.start) * 2;
      if (off + 4 <= floatBuf.length) {
        const val = floatBuf.readFloatBE(off);
        lines.push(`  ${name.padEnd(20)} ${Number.isFinite(val) ? val.toFixed(4) : val}`);
      }
    }
  }
  if (statusBuf && statusBuf.length >= 16) {
    const sys = statusBuf.readUInt32BE(0);            // 2008
    const din = statusBuf.readUInt32BE(4);            // 2010
    const prv = statusBuf.readUInt32BE(8);            // 2012
    const msg = statusBuf.readUInt32BE(12);           // 2014
    lines.push(`  ${'System Status'.padEnd(20)} 0x${sys.toString(16).padStart(2, '0')}`);
    lines.push(`  ${'Digital Inputs'.padEnd(20)} 0x${din.toString(16).padStart(3, '0')}  ${decodeDigIns(din)}`);
    lines.push(`  ${'Prover Status'.padEnd(20)} ${prv}  (${PROVER_STATES[prv] || '?'})`);
    lines.push(`  ${'Msg Id (2Hz tick)'.padEnd(20)} ${msg}`);
  }
  const out = lines.join('\n');
  console.log(out);
  logln(out);
}

// ── TCP transport ─────────────────────────────────────────────────────────────
function runTcp() {
  const ip = args[1];
  const unitId = Number(args[2] || 1);
  const interval = Number(args[3] || 1000);
  if (!ip) { console.error('Usage: node modbus.js tcp <ip> [unitId] [intervalMs]'); process.exit(1); }

  console.log(`\nModbus/TCP → ${ip}:502  unit ${unitId}  every ${interval}ms`);
  console.log(`Log: ${logPath}\nPress Ctrl-C to stop.\n`);

  const sock = net.connect(502, ip);
  let txn = 0;
  const pending = new Map();
  let buf = Buffer.alloc(0);

  sock.on('connect', () => { console.log('✓ TCP connected\n'); poll(); });
  sock.on('error', (e) => { console.error('TCP error:', e.message); helpNoConnect(); process.exit(1); });
  sock.on('close', () => { console.log('\nConnection closed.'); process.exit(0); });

  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 6) {
      const len = buf.readUInt16BE(4);
      if (buf.length < 6 + len) break;
      const frame = buf.subarray(0, 6 + len);
      buf = buf.subarray(6 + len);
      const tid = frame.readUInt16BE(0);
      const pdu = frame.subarray(7);
      const cb = pending.get(tid);
      if (cb) { pending.delete(tid); cb(pdu); }
    }
  });

  function read(addr, qty) {
    return new Promise((resolve, reject) => {
      txn = (txn + 1) & 0xffff;
      const tid = txn;
      const pdu = readPDU(addr, qty);
      const mbap = Buffer.alloc(7);
      mbap.writeUInt16BE(tid, 0);
      mbap.writeUInt16BE(0, 2);
      mbap.writeUInt16BE(1 + pdu.length, 4);
      mbap.writeUInt8(unitId, 6);
      const to = setTimeout(() => { pending.delete(tid); reject(new Error('timeout')); }, 2000);
      pending.set(tid, (resp) => {
        clearTimeout(to);
        if (resp[0] & 0x80) return reject(new Error('Modbus exception 0x' + resp[1].toString(16)));
        resolve(resp.subarray(2, 2 + resp[1]));
      });
      sock.write(Buffer.concat([mbap, pdu]));
    });
  }

  async function poll() {
    try {
      const floats = await read(FLOAT_BLOCK.start, FLOAT_BLOCK.qty);
      const status = await read(STATUS_BLOCK.start, STATUS_BLOCK.qty);
      render(floats, status);
    } catch (e) {
      console.error('poll failed:', e.message, '(wrong unit id? wrong mode? not in RTU?)');
    }
    setTimeout(poll, interval);
  }
}

// ── RTU (serial) transport ────────────────────────────────────────────────────
function runRtu() {
  const port = args[1];
  const baud = Number(args[2] || 19200);
  const unitId = Number(args[3] || 1);
  const interval = Number(args[4] || 1000);
  if (!port) { console.error('Usage: node modbus.js rtu <COMport> [baud] [unitId] [intervalMs]'); process.exit(1); }

  const { SerialPort } = require('serialport');
  console.log(`\nModbus/RTU → ${port} @ ${baud} 8N1  unit ${unitId}  every ${interval}ms`);
  console.log(`Log: ${logPath}\nPress Ctrl-C to stop.\n`);

  const sp = new SerialPort({ path: port, baudRate: baud, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false });
  let rx = Buffer.alloc(0);
  let waiter = null;

  sp.on('data', (d) => {
    rx = Buffer.concat([rx, d]);
    if (waiter && rx.length >= waiter.need) {
      const w = waiter; waiter = null;
      const frame = rx.subarray(0, w.need); rx = rx.subarray(w.need);
      w.resolve(frame);
    }
  });

  function read(addr, qty) {
    return new Promise((resolve, reject) => {
      const pdu = readPDU(addr, qty);
      const body = Buffer.concat([Buffer.from([unitId]), pdu]);
      const c = crc16(body);
      const frame = Buffer.concat([body, Buffer.from([c & 0xff, (c >> 8) & 0xff])]);
      const need = 1 + 1 + 1 + 2 * qty + 2;            // addr+func+bytecount+data+crc
      rx = Buffer.alloc(0);
      const to = setTimeout(() => { waiter = null; reject(new Error('timeout')); }, 1500);
      waiter = { need, resolve: (f) => { clearTimeout(to);
        if (f[1] & 0x80) return reject(new Error('Modbus exception 0x' + f[2].toString(16)));
        const calc = crc16(f.subarray(0, f.length - 2));
        const got = f.readUInt16LE(f.length - 2);
        if (calc !== got) return reject(new Error('bad CRC'));
        resolve(f.subarray(3, 3 + f[2]));
      } };
      sp.write(frame, (e) => e && reject(e));
    });
  }

  sp.open((err) => {
    if (err) { console.error('Cannot open', port + ':', err.message); process.exit(1); }
    console.log('✓ serial open\n');
    (async function poll() {
      try {
        const floats = await read(FLOAT_BLOCK.start, FLOAT_BLOCK.qty);
        const status = await read(STATUS_BLOCK.start, STATUS_BLOCK.qty);
        render(floats, status);
      } catch (e) {
        console.error('poll failed:', e.message, '(wrong unit id / not in RTU mode / wrong baud / RS485 A-B swapped?)');
      }
      setTimeout(poll, interval);
    })();
  });
}

// ── Self-test (offline) ───────────────────────────────────────────────────────
function runSelftest() {
  // Known-good frame from the manual / our earlier CRC check.
  const body = Buffer.concat([Buffer.from([0x01]), readPDU(2038, 2)]);
  const c = crc16(body);
  const frame = Buffer.concat([body, Buffer.from([c & 0xff, (c >> 8) & 0xff])]);
  const hex = Array.from(frame).map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const expected = '01 03 07 f6 00 02 25 4d';
  console.log('Built FC03 reg2038 x2 (unit 1):', hex);
  console.log('Expected                       :', expected);
  console.log(hex === expected ? '✓ frame + CRC correct' : '✗ MISMATCH');
  process.exit(hex === expected ? 0 : 1);
}

function helpNoConnect() {
  console.error('  • Is the RMU in RTU mode? SW1 must be 1-9 / C / D (not 0/F/E = PIU).');
  console.error('  • Right IP? Use MicroConf to discover it, or the direct-connect fallback 10.255.255.255.');
  console.error('  • Ethernet cable plugged in and link light on?');
}

process.on('SIGINT', () => { console.log('\nStopped. Log:', logPath); process.exit(0); });

if (MODE === 'tcp') runTcp();
else if (MODE === 'rtu') runRtu();
else if (MODE === 'selftest') runSelftest();
else { console.error('Unknown mode. Use: tcp | rtu | selftest'); process.exit(1); }
