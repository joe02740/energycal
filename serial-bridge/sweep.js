'use strict';

/**
 * µ³ RMU serial sweeper — the "just tell me what works" tool.
 *
 * Pure Node + serialport. No browser, no dev server, no internet. Run it in a
 * terminal next to the prover, watch the table, and the winning row is the
 * config that produced bytes. Every trial's raw bytes are also written to
 * ./captures/ as hex+ASCII so you can decode the protocol later.
 *
 * USAGE
 *   node sweep.js [MODE] [COM_PORT] [SECONDS_PER_TRIAL]
 *
 * MODES
 *   proveit   (default) Open the PROVEN config once and stream — 9600 8N1, no
 *                       flow, DTR=1 RTS=0 — exactly what PROVEit ends up at.
 *   capture             Same as proveit but runs until Ctrl-C (long capture for
 *                       decoding). Everything is logged to ./captures/.
 *   signals             9600 8N1, cycle all 4 DTR/RTS combos + a hardware-flow
 *                       trial. Best when you suspect a line-state / handshake issue.
 *   baud                8N1, DTR=1 RTS=0, cycle 1200..115200.
 *   parity              9600, DTR=1 RTS=0, cycle 8N1 / 7E1 / 7O1 / 8E1 / 8O1 / 7N1.
 *   all                 Reduced full matrix: baud × {8N1,7E1,7O1} × {DTR1RTS0,DTR1RTS1}.
 *
 * EXAMPLES
 *   node sweep.js                       # proven config on COM4
 *   node sweep.js signals COM4          # try every DTR/RTS combo
 *   node sweep.js all COM4 2            # full matrix, 2s per trial
 *   node sweep.js capture COM4          # long capture for decoding
 *
 * Find the port first:  node list-ports.js
 */

const fs = require('fs');
const path = require('path');
const { SerialPort } = require('serialport');

// ── Args ──────────────────────────────────────────────────────────────────────
const MODE = (process.argv[2] || 'proveit').toLowerCase();
const PORT = process.argv[3] || process.env.COM_PORT || 'COM4';
const SECS = Number(process.argv[4] || process.env.SWEEP_SECS || (MODE === 'all' ? 1.8 : 2.5));
const MS   = Math.max(500, Math.round(SECS * 1000));

const CAP_DIR = path.join(__dirname, 'captures');
fs.mkdirSync(CAP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logPath = path.join(CAP_DIR, `sweep-${MODE}-${PORT}-${stamp}.log`);
const log = fs.createWriteStream(logPath, { flags: 'a' });
function logln(s = '') { log.write(s + '\n'); }

// ── Trial definitions ─────────────────────────────────────────────────────────
const PROVEN = { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, dtr: true, rts: false, rtscts: false };

function framing(label, parity, dataBits = 8, stopBits = 1) {
  return { label, parity, dataBits, stopBits };
}
const FRAMINGS = [
  framing('8N1', 'none', 8, 1),
  framing('7E1', 'even', 7, 1),
  framing('7O1', 'odd', 7, 1),
  framing('8E1', 'even', 8, 1),
  framing('8O1', 'odd', 8, 1),
  framing('7N1', 'none', 7, 1),
];
const BAUDS = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
const SIGNALS = [
  { label: 'DTR1 RTS0', dtr: true, rts: false },   // PROVEit end-state
  { label: 'DTR1 RTS1', dtr: true, rts: true },
  { label: 'DTR0 RTS0', dtr: false, rts: false },
  { label: 'DTR0 RTS1', dtr: false, rts: true },
];

function buildTrials() {
  switch (MODE) {
    case 'proveit':
    case 'capture':
      return [{ ...PROVEN, label: 'PROVEN 9600 8N1 DTR1 RTS0' }];

    case 'signals': {
      const t = SIGNALS.map((s) => ({
        ...PROVEN, dtr: s.dtr, rts: s.rts, label: `9600 8N1 ${s.label}`,
      }));
      // plus a hardware-flow-control trial (device has CTS/RTS pins)
      t.push({ ...PROVEN, rtscts: true, label: '9600 8N1 HW flow (RTS/CTS)' });
      return t;
    }

    case 'baud':
      return BAUDS.map((b) => ({ ...PROVEN, baudRate: b, label: `${b} 8N1 DTR1 RTS0` }));

    case 'parity':
      return FRAMINGS.map((f) => ({
        ...PROVEN, parity: f.parity, dataBits: f.dataBits, stopBits: f.stopBits,
        label: `9600 ${f.label} DTR1 RTS0`,
      }));

    case 'all': {
      const out = [];
      for (const b of BAUDS) {
        for (const f of [FRAMINGS[0], FRAMINGS[1], FRAMINGS[2]]) {       // 8N1, 7E1, 7O1
          for (const s of [SIGNALS[0], SIGNALS[1]]) {                    // DTR1RTS0, DTR1RTS1
            out.push({
              baudRate: b, parity: f.parity, dataBits: f.dataBits, stopBits: f.stopBits,
              dtr: s.dtr, rts: s.rts, rtscts: false,
              label: `${b} ${f.label} ${s.label}`,
            });
          }
        }
      }
      return out;
    }

    default:
      console.error(`Unknown mode "${MODE}". Use: proveit | capture | signals | baud | parity | all`);
      process.exit(1);
  }
}

// ── Hex dump helper ───────────────────────────────────────────────────────────
function hexDump(buf) {
  const lines = [];
  for (let i = 0; i < buf.length; i += 16) {
    const slice = buf.subarray(i, i + 16);
    const hex = Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' ');
    const asc = Array.from(slice).map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    lines.push(`  ${i.toString(16).padStart(4, '0')}  ${hex.padEnd(47)}  ${asc}`);
  }
  return lines.join('\n');
}

// ── Run one trial ─────────────────────────────────────────────────────────────
function runTrial(cfg, ms) {
  return new Promise((resolve) => {
    const chunks = [];
    let bytes = 0;
    let settled = false;

    const port = new SerialPort({
      path: PORT,
      baudRate: cfg.baudRate,
      dataBits: cfg.dataBits,
      stopBits: cfg.stopBits,
      parity: cfg.parity,
      rtscts: !!cfg.rtscts,
      autoOpen: false,
    });

    const finish = (errMsg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const done = () => resolve({ cfg, bytes, data: Buffer.concat(chunks), error: errMsg || null });
      if (port.isOpen) { port.removeAllListeners(); port.close(() => setTimeout(done, 250)); }
      else done();
    };

    const timer = setTimeout(() => finish(null), ms);

    port.on('data', (d) => { bytes += d.length; chunks.push(d); });
    port.on('error', (e) => finish(e.message));

    port.open((err) => {
      if (err) { finish(err.message); return; }
      // Replay PROVEit's signal end-state AFTER open. Always set both lines.
      if (!cfg.rtscts) {
        port.set({ dtr: cfg.dtr, rts: cfg.rts }, () => {});
      }
    });
  });
}

// ── Capture (long-run) mode ───────────────────────────────────────────────────
function runCapture() {
  console.log(`\nLong capture on ${PORT} — PROVEN config (9600 8N1, DTR=1 RTS=0, no flow).`);
  console.log(`Logging raw bytes to: ${logPath}`);
  console.log('Press Ctrl-C to stop.\n');
  logln(`# capture ${PORT}  9600 8N1 DTR1 RTS0 no-flow  ${new Date().toISOString()}`);

  let total = 0;
  const port = new SerialPort({
    path: PORT, baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', rtscts: false, autoOpen: false,
  });
  port.on('data', (d) => {
    total += d.length;
    process.stdout.write(`← ${total} bytes total\r`);
    logln(hexDump(d));
  });
  port.on('error', (e) => { console.error('\nSerial error:', e.message); printOpenHelp(e.message); });
  port.open((err) => {
    if (err) { console.error('Cannot open:', err.message); printOpenHelp(err.message); process.exit(1); }
    console.log(`✓ ${PORT} open. Waiting for the µ³ to stream…\n`);
    port.set({ dtr: true, rts: false }, () => {});
  });
  process.on('SIGINT', () => {
    console.log(`\n\nCaptured ${total} bytes → ${logPath}`);
    if (port.isOpen) port.close(() => process.exit(0)); else process.exit(0);
  });
}

// ── Sweep (multi-trial) mode ──────────────────────────────────────────────────
async function runSweep() {
  const trials = buildTrials();
  console.log(`\nSweeping ${PORT} — mode "${MODE}", ${trials.length} trial(s), ${MS / 1000}s each.`);
  console.log(`Full log: ${logPath}\n`);
  logln(`# sweep mode=${MODE} port=${PORT} trials=${trials.length} ms=${MS}  ${new Date().toISOString()}`);

  console.log('  #   Config                              bytes   first bytes (hex)');
  console.log('  ──  ──────────────────────────────────  ─────   ─────────────────────────');

  const results = [];
  for (let i = 0; i < trials.length; i++) {
    const cfg = trials[i];
    process.stdout.write(`  ${String(i + 1).padStart(2)}  ${cfg.label.padEnd(36)}  …      `);
    const r = await runTrial(cfg, MS);              // eslint-disable-line no-await-in-loop
    results.push(r);

    const snippet = r.bytes
      ? Array.from(r.data.subarray(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join(' ')
      : (r.error ? `(${r.error})` : '—');
    const flag = r.bytes ? '✓' : ' ';
    process.stdout.write(`\r  ${String(i + 1).padStart(2)}  ${cfg.label.padEnd(36)}  ${String(r.bytes).padStart(5)} ${flag} ${snippet}\n`);

    logln(`\n## trial ${i + 1}: ${cfg.label}  → ${r.bytes} bytes${r.error ? '  ERROR: ' + r.error : ''}`);
    if (r.bytes) logln(hexDump(r.data));
  }

  // ── Summary ──
  const hits = results.filter((r) => r.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  console.log('\n────────────────────────────────────────────────────────────────');
  if (hits.length) {
    console.log(`✓ ${hits.length} config(s) produced data. Best:`);
    for (const h of hits.slice(0, 5)) {
      console.log(`    ${h.cfg.label}   (${h.bytes} bytes)`);
    }
    const top = hits[0].cfg;
    console.log('\nTo use the winner with the bridge:');
    console.log(`    node bridge.js ${PORT} ${top.baudRate}`);
    if (top.parity !== 'none' || top.dataBits !== 8) {
      console.log(`    (note framing ${top.dataBits}${top.parity[0].toUpperCase()}${top.stopBits} — bridge currently assumes 8N1; tell me and I'll add a framing flag)`);
    }
  } else {
    console.log('✗ No data on any trial. Checklist:');
    console.log('    • Is the port right?  node list-ports.js   (COM6 = Bluetooth, not the adapter)');
    console.log('    • Is the port free?   close PROVEit / Serial Port Monitor / PuTTY (Access denied = in use)');
    console.log('    • Is the device powered and does PROVEit see it on this same port/cable?');
    console.log('    • Cable: µ³ COM1 RS232 = TX·RX·GND·CTS·RTS·SCN. Confirm TX↔RX are not swapped.');
    console.log('    • Try:  node sweep.js all ' + PORT + '   (full baud × framing × signal matrix)');
  }
  console.log(`\nRaw capture log: ${logPath}\n`);
  log.end();
}

function printOpenHelp(msg) {
  if (/access denied/i.test(msg || '')) {
    console.error('  → Port is already open in another app. Close PROVEit / Serial Port Monitor / PuTTY and retry.');
  } else {
    console.error('  → Check the port name with `node list-ports.js` and that the adapter is plugged in.');
  }
}

// ── Go ────────────────────────────────────────────────────────────────────────
if (MODE === 'capture') runCapture();
else runSweep();
