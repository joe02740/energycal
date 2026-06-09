'use strict';

/**
 * PIU master — polls the RMU directly over RS-232, exactly like PROVEit does,
 * using the protocol reverse-engineered from the capture:
 *   command  = 50 XX            (0x50 'P' + register selector)
 *   response = 01 50 XX … CHK   (CHK = sum of bytes[1..n-2] & 0xff)
 *
 *   node piu.js [COM_PORT] [BAUD]
 *
 * Probes every known register once, then polls the live data block (P4) and
 * prints whether the RMU answers us with valid frames. Logs raw frames to
 * captures/ for field decoding.
 */

const fs = require('fs');
const path = require('path');
const { SerialPort } = require('serialport');

const PORT = process.argv[2] || 'COM6';
const BAUD = Number(process.argv[3] || 9600);

// Known commands → expected response length (from the capture).
const CMDS = [
  { c: 0x31, len: 4, name: 'P1' },
  { c: 0x32, len: 4, name: 'P2' },
  { c: 0x33, len: 4, name: 'P3' },
  { c: 0x34, len: 121, name: 'P4 (live data)' },
  { c: 0x35, len: 4, name: 'P5' },
  { c: 0x36, len: 4, name: 'P6' },
  { c: 0x3b, len: 40, name: 'P; (config)' },
  { c: 0x3c, len: 9, name: 'P< (status)' },
];
const EXPECTED = Object.fromEntries(CMDS.map((x) => [x.c, x.len]));

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');
function validFrame(b) {
  if (b.length < 4 || b[0] !== 0x01 || b[1] !== 0x50) return false;
  let s = 0;
  for (let i = 1; i < b.length - 1; i++) s = (s + b[i]) & 0xff;
  return s === b[b.length - 1];
}

const CAP = path.join(__dirname, 'captures');
fs.mkdirSync(CAP, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const log = fs.createWriteStream(path.join(CAP, `piu-live-${stamp}.log`), { flags: 'a' });

const port = new SerialPort({ path: PORT, baudRate: BAUD, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false });

function poll(cmdByte, timeoutMs = 700) {
  return new Promise((resolve) => {
    const need = EXPECTED[cmdByte] || 0;
    let buf = Buffer.alloc(0);
    let idle = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      port.removeListener('data', onData);
      clearTimeout(to);
      clearTimeout(idle);
      resolve(buf);
    };
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      if (need && buf.length >= need) return finish();
      if (!need) { clearTimeout(idle); idle = setTimeout(finish, 120); }
    };
    port.on('data', onData);
    const to = setTimeout(finish, timeoutMs);
    port.write(Buffer.from([0x50, cmdByte]));
  });
}

port.open(async (err) => {
  if (err) {
    console.error(`Cannot open ${PORT}: ${err.message}`);
    console.error('  • Is the ATEN plugged into THIS laptop? • Is PROVEit closed (port free)?');
    console.error('  • Right port?  node list-ports.js');
    process.exit(1);
  }
  // Match PROVEit's line state: DTR high, RTS low.
  port.set({ dtr: true, rts: false }, () => {});
  console.log(`✓ ${PORT} open at ${BAUD} 8N1, DTR=1 RTS=0. Probing the RMU as PROVEit does…\n`);

  // 1) Probe every known register once.
  let good = 0;
  for (const { c, len, name } of CMDS) {
    const r = await poll(c); // eslint-disable-line no-await-in-loop
    const ok = validFrame(r);
    if (ok) good++;
    log.write(`PROBE 50 ${c.toString(16)} -> ${hex(r)}\n`);
    console.log(`  50 ${c.toString(16)}  ${name.padEnd(15)} ${String(r.length).padStart(3)}b  ${ok ? '✓ valid' : r.length ? '✗ bad/short' : '— no reply'}  ${hex(r).slice(0, 60)}`);
  }
  console.log(`\n  ${good}/${CMDS.length} registers answered with valid PIU frames.`);
  if (good === 0) {
    console.log('  No replies — check the ATEN is on this laptop, PROVEit is closed, and the cable is on COM1.');
    port.close(() => process.exit(1));
    return;
  }
  console.log('\nNow polling P4 (live data block) once a second. Ctrl-C to stop.\n');

  // 2) Continuously poll the live data block.
  let n = 0;
  const tick = async () => {
    const r = await poll(0x34);
    n++;
    const ok = validFrame(r);
    log.write(`P4 ${hex(r)}\n`);
    if (ok) {
      // sample counter sits around byte 56; the 32-bit data words follow.
      const counter = r[56];
      console.log(`  #${String(n).padStart(3)}  P4 121b ✓  counter=0x${counter.toString(16)}  chk OK`);
    } else {
      console.log(`  #${String(n).padStart(3)}  P4 ${r.length}b ✗ (no/short reply)`);
    }
    setTimeout(tick, 1000);
  };
  tick();
});

process.on('SIGINT', () => { console.log('\nStopped.'); if (port.isOpen) port.close(() => process.exit(0)); else process.exit(0); });
