'use strict';

/**
 * Calibron µ³ RMU Serial Bridge
 *
 * Opens a COM port using the standard Windows serial API (via the `serialport`
 * npm package) and bridges it to a local WebSocket server that the browser
 * connects to. This bypasses the Chrome Web Serial API entirely — the Windows
 * COM port driver handles DTR/RTS the same way PROVEit does.
 *
 * PROVEN CONFIG (from the PROVEit Serial Port Monitor capture, COM4, 2026-05-12):
 *   SET_BAUD 9600 (80 25 00 00) → CLR_RTS → SET_DTR → SET_LINE_CONTROL 00 00 08 (=8N1)
 *   → SET_HANDFLOW 00.. (no flow control) → WAIT_ON_MASK (RXCHAR).
 *   End line-state: DTR = HIGH, RTS = LOW. The µ³ then streams unsolicited.
 *
 * Usage:
 *   node bridge.js [COM_PORT] [BAUD_RATE]
 *   node bridge.js COM4 9600
 *
 * Or via environment variables:
 *   COM_PORT=COM4 BAUD_RATE=9600 node bridge.js
 *
 * Find the right COM port first:  node list-ports.js   (or  npm run list)
 *
 * The browser connects to ws://127.0.0.1:8765
 * Binary frames  = raw serial bytes (both directions)
 * Text frames    = JSON status/control messages
 */

const { SerialPort } = require('serialport');
const { WebSocketServer, WebSocket } = require('ws');

// ── Config ────────────────────────────────────────────────────────────────────
// NOTE: COM6 on the field laptop is "Standard Serial over Bluetooth link" — the
// WIRED ATEN UC-232A adapter enumerates as a different port (COM4 on 2026-05-12).
// Always confirm with `node list-ports.js`. Override via arg/env if it differs.
const COM_PORT  = process.env.COM_PORT  || process.argv[2] || 'COM4';
const BAUD_RATE = Number(process.env.BAUD_RATE || process.argv[3] || 9600);
const WS_PORT   = Number(process.env.WS_PORT   || 8765);
// Bind IPv4 explicitly AND have the browser connect to ws://127.0.0.1 (not
// "localhost") — on Windows 11 "localhost" resolves to ::1 (IPv6) first, which a
// 127.0.0.1-only server never answers. Keeping both ends on 127.0.0.1 guarantees
// a match while staying loopback-only.
const WS_HOST   = process.env.WS_HOST || '127.0.0.1';

// Proven-good line state. set() always sends BOTH dtr and rts so serialport's
// defaultSetFlags ({dtr:true, rts:true}) can never silently flip the other line.
const signalState = { dtr: true, rts: false };

console.log('┌─────────────────────────────────────────┐');
console.log('│  Calibron Serial Bridge                  │');
console.log('├─────────────────────────────────────────┤');
console.log(`│  Serial  : ${COM_PORT} @ ${BAUD_RATE} baud`.padEnd(43) + '│');
console.log(`│  Framing : 8N1, no flow control`.padEnd(43) + '│');
console.log(`│  Signals : DTR=1 RTS=0 (PROVEit end-state)`.padEnd(43) + '│');
console.log(`│  WS      : ws://127.0.0.1:${WS_PORT}`.padEnd(43) + '│');
console.log('└─────────────────────────────────────────┘');
console.log('');

// ── WebSocket server (loopback only) ──────────────────────────────────────────
const wss = new WebSocketServer({ host: WS_HOST, port: WS_PORT });
const clients = new Set();

function broadcast(data) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(data); } catch { /* ignore */ }
    }
  }
}

function sendJSON(ws, obj) {
  try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
}

function broadcastJSON(obj) {
  const msg = JSON.stringify(obj);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch { /* ignore */ }
    }
  }
}

// ── Serial port lifecycle ─────────────────────────────────────────────────────
// A single `currentPort` reference is the live port. Reopening (baud change)
// tears the old one down FIRST, then swaps the reference — so control writes,
// isOpen checks and signal changes always target the port that is actually open.
let currentPort = null;
let currentBaud = BAUD_RATE;

function applySignals(port) {
  if (!port || !port.isOpen) return;
  port.set({ dtr: signalState.dtr, rts: signalState.rts }, (err) => {
    if (err) console.error('set DTR/RTS failed:', err.message);
    else     console.log(`  DTR=${signalState.dtr ? 1 : 0} RTS=${signalState.rts ? 1 : 0} (PROVEit end-state)`);
  });
}

function wirePort(port) {
  port.on('data', (/** @type {Buffer} */ data) => {
    broadcast(data);
    if (clients.size > 0) process.stdout.write(`← ${data.length} bytes  \r`);
  });
  port.on('error', (err) => {
    console.error('Serial error:', err.message);
    broadcastJSON({ type: 'serial_error', message: err.message });
  });
  port.on('close', () => {
    console.log(`${COM_PORT} closed`);
    broadcastJSON({ type: 'serial_closed', port: COM_PORT });
  });
}

// Open COM_PORT at `baud`, replaying PROVEit's signal end-state. Closes any
// previously-open port first so we never double-open the same COM port
// (which fails with native "Access denied").
function openPort(baud, done) {
  const start = () => {
    currentBaud = baud;
    const p = new SerialPort({
      path: COM_PORT,
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false, // no hardware flow control — matches PROVEit's SET_HANDFLOW 00..
      autoOpen: false,
    });
    wirePort(p);
    p.open((err) => {
      if (err) {
        console.error(`✗ Cannot open ${COM_PORT} at ${baud}: ${err.message}`);
        printOpenHelp(err);
        broadcastJSON({ type: 'serial_error', message: err.message });
        if (done) done(err);
        return;
      }
      currentPort = p;
      console.log(`✓ ${COM_PORT} open at ${baud} baud`);
      applySignals(p);
      broadcastJSON({ type: 'serial_open', port: COM_PORT, baud });
      if (done) done(null);
    });
  };

  if (currentPort && currentPort.isOpen) {
    const old = currentPort;
    currentPort = null;
    old.removeAllListeners(); // don't emit 'close' for an intentional reopen
    old.close(() => start());
  } else {
    start();
  }
}

function printOpenHelp(err) {
  const msg = (err && err.message) || '';
  console.error('');
  console.error('  Possible causes:');
  if (/access denied/i.test(msg)) {
    console.error('  • Port is ALREADY OPEN in another app — close PROVEit, Serial Port');
    console.error('    Monitor, PuTTY, or any other bridge/terminal, then retry.');
    console.error('    (A COM port can only be owned by one process at a time.)');
  }
  console.error('  • Wrong COM port — run `node list-ports.js` to see what is attached');
  console.error('    (COM6 is the Bluetooth link; the wired ATEN adapter is a different port)');
  console.error('  • USB adapter not plugged in');
  console.error('');
  console.error('  To use a different port:  node bridge.js COM4 9600');
  console.error('');
}

// ── WebSocket events ──────────────────────────────────────────────────────────
wss.on('listening', () => {
  console.log(`✓ WebSocket listening on ws://${WS_HOST}:${WS_PORT}`);
  console.log('  Open http://localhost:3000/piu-diagnostics in Chrome/Edge, then Connect.');
  console.log('');
});

wss.on('connection', (ws, req) => {
  const addr = req.socket.remoteAddress || 'unknown';
  console.log(`Browser connected (${addr})`);
  clients.add(ws);

  // Tell the browser the current state immediately
  sendJSON(ws, {
    type: currentPort && currentPort.isOpen ? 'serial_open' : 'serial_closed',
    port: COM_PORT,
    baud: currentBaud,
  });

  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      handleControl(ws, data.toString());
      return;
    }
    // Binary frame = bytes to write to serial
    if (currentPort && currentPort.isOpen) {
      currentPort.write(/** @type {Buffer} */ (data), (err) => {
        if (err) console.error('Write error:', err.message);
      });
    } else {
      sendJSON(ws, { type: 'serial_error', message: 'Serial port is not open' });
    }
  });

  ws.on('close', () => {
    console.log('Browser disconnected');
    clients.delete(ws);
  });

  ws.on('error', () => clients.delete(ws));
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ Port ${WS_PORT} is already in use. Is the bridge already running?`);
  } else {
    console.error('WebSocket server error:', err.message);
  }
  process.exit(1);
});

// ── Control messages from browser ─────────────────────────────────────────────
function handleControl(ws, raw) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }

  if (msg.type === 'set_baud') {
    const newBaud = Number(msg.baudRate);
    if (!newBaud || newBaud === currentBaud) return;
    console.log(`Changing baud rate: ${currentBaud} → ${newBaud}`);
    openPort(newBaud);
    return;
  }

  // Pulse DTR low then back high — mimics PROVEit's CLR_DTR/SET_DTR. Always sends
  // rts alongside dtr so the deliberate RTS=LOW is preserved (serialport's set()
  // would otherwise default the omitted rts back to HIGH and re-mute the device).
  if (msg.type === 'pulse_dtr') {
    if (!currentPort || !currentPort.isOpen) return;
    console.log('Pulsing DTR: 1 → 0 → 1');
    currentPort.set({ dtr: false, rts: signalState.rts }, () => {
      setTimeout(() => {
        signalState.dtr = true;
        currentPort.set({ dtr: true, rts: signalState.rts }, (err) => {
          if (err) console.error('pulse_dtr restore failed:', err.message);
          else     console.log(`  DTR back to 1 (RTS still ${signalState.rts ? 1 : 0})`);
        });
      }, 100);
    });
    return;
  }

  // Arbitrary DTR/RTS combinations for the diagnostics page. Both lines are always
  // written together from the tracked signalState so neither can be clobbered.
  if (msg.type === 'set_signals') {
    if (!currentPort || !currentPort.isOpen) return;
    if (typeof msg.dtr === 'boolean') signalState.dtr = msg.dtr;
    if (typeof msg.rts === 'boolean') signalState.rts = msg.rts;
    currentPort.set({ dtr: signalState.dtr, rts: signalState.rts }, (err) => {
      if (err) console.error('set_signals failed:', err.message);
      else     console.log(`  signals set: DTR=${signalState.dtr ? 1 : 0} RTS=${signalState.rts ? 1 : 0}`);
    });
    return;
  }
}

// ── Initial open (after a port sanity check) ──────────────────────────────────
SerialPort.list()
  .then((ports) => {
    const found = ports.find((p) => p.path.toLowerCase() === COM_PORT.toLowerCase());
    if (!found) {
      console.warn(`⚠ ${COM_PORT} is not in the list of attached ports:`);
      for (const p of ports) {
        console.warn(`    ${p.path.padEnd(6)} ${p.friendlyName || p.manufacturer || ''}`);
      }
      console.warn(`  Re-launch with the correct port, e.g.:  node bridge.js COM4 9600`);
      console.warn('');
    }
    openPort(BAUD_RATE);
  })
  .catch(() => openPort(BAUD_RATE));

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\nShutting down…');
  const finish = () => wss.close(() => process.exit(0));
  if (currentPort && currentPort.isOpen) currentPort.close(finish);
  else finish();
});
