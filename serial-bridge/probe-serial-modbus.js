'use strict';

/**
 * Cheap probe: does the P572 answer Modbus RTU on the COM1 RS-232 serial port?
 * Sends a few FC03/FC04/FC08 frames at 9600 and 19200 and prints any reply.
 * A reply means we can read the prover over the existing USB-serial — no Ethernet,
 * no SW1 change. Silence means COM1 is PIU-only and we pivot to Modbus/Ethernet.
 *
 *   node probe-serial-modbus.js [COM_PORT] [BAUD]
 */

const { SerialPort } = require('serialport');

const PORT = process.argv[2] || 'COM6';
const BAUDS = process.argv[3] ? [Number(process.argv[3])] : [9600, 19200];

function crc16(b) {
  let c = 0xffff;
  for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c & 1) ? (c >> 1) ^ 0xa001 : c >> 1; }
  return c;
}
function read(unit, fc, addr, qty) {
  const a = [unit, fc, (addr >> 8) & 255, addr & 255, (qty >> 8) & 255, qty & 255];
  const c = crc16(a);
  return Buffer.from([...a, c & 255, (c >> 8) & 255]);
}
function loopback(unit) {
  const a = [unit, 8, 0, 0, 0x12, 0x34];
  const c = crc16(a);
  return Buffer.from([...a, c & 255, (c >> 8) & 255]);
}

const probes = [
  { label: 'FC03 reg1000 x2 (legacy float freq), unit1', f: read(1, 3, 1000, 2) },
  { label: 'FC03 reg2000 x2 (scaled HW ver),     unit1', f: read(1, 3, 2000, 2) },
  { label: 'FC04 reg2038 x2 (input freq),        unit1', f: read(1, 4, 2038, 2) },
  { label: 'FC08 loopback,                        unit1', f: loopback(1) },
  // address scan in case it is not unit 1
  { label: 'FC03 reg2000 x2, unit2', f: read(2, 3, 2000, 2) },
  { label: 'FC03 reg2000 x2, unit3', f: read(3, 3, 2000, 2) },
];

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

function tryBaud(baud) {
  return new Promise((resolve) => {
    const sp = new SerialPort({ path: PORT, baudRate: baud, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false });
    let buf = Buffer.alloc(0);
    sp.on('data', (d) => { buf = Buffer.concat([buf, d]); });
    sp.on('error', (e) => { console.log(`  [${baud}] error: ${e.message}`); resolve(false); });
    sp.open(async (err) => {
      if (err) { console.log(`  [${baud}] cannot open: ${err.message}`); return resolve(false); }
      sp.set({ dtr: true, rts: true }, () => {});
      console.log(`\n== ${baud} baud 8N1 ==`);
      let anyReply = false;
      for (const p of probes) {
        buf = Buffer.alloc(0);
        sp.write(p.f);
        await new Promise((r) => setTimeout(r, 500));
        if (buf.length) anyReply = true;
        console.log(`  ${p.label.padEnd(40)} RX ${buf.length ? hex(buf) : '(silence)'}`);
      }
      sp.close(() => resolve(anyReply));
    });
  });
}

(async () => {
  console.log(`Modbus-over-serial probe on ${PORT}`);
  let any = false;
  for (const b of BAUDS) { if (await tryBaud(b)) any = true; }
  console.log(any
    ? '\n✓ Got Modbus replies on COM1 — we can read the prover over this serial link.'
    : '\n✗ No Modbus reply on COM1 (expected — COM1 is PIU-only). Pivot to Modbus/Ethernet (SW1→C).');
})();
