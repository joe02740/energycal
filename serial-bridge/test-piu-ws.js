'use strict';
// Mirrors what the app's PiuRs232Controller does: connect to bridge.js over WS,
// poll "50 34", frame the responses, decode temp/pressure. If this prints sane
// values, the /piu-serial page will too.
const WebSocket = require('ws');
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const FIELD = [60, 68, 76, 84, 92, 100];
function valid(b) { if (b.length !== 121 || b[0] !== 1 || b[1] !== 0x50) return false; let s = 0; for (let i = 1; i < 120; i++) s = (s + b[i]) & 0xff; return s === b[120]; }
function decode(f0, f1) {
  const dc = u32(f1, 56) - u32(f0, 56); if (dc <= 0) return null;
  const ma = FIELD.map((o) => (((u32(f1, o) - u32(f0, o)) / dc) - 21) / 2729);
  return { tempF: 32 + ((ma[0] - 4) / 16) * 180 - 7, psi: ((ma[1] - 4) / 16) * 300, ma, ctr: u32(f1, 56) };
}
const ws = new WebSocket('ws://127.0.0.1:8765');
ws.binaryType = 'arraybuffer';
let acc = Buffer.alloc(0); const frames = [];
ws.on('open', () => { console.log('WS open → polling 50 34'); setInterval(() => ws.send(Buffer.from([0x50, 0x34])), 400); });
ws.on('message', (data, isBinary) => {
  if (!isBinary) { console.log('ctrl:', data.toString()); return; }
  acc = Buffer.concat([acc, Buffer.from(data)]);
  while (acc.length >= 121) {
    if (!(acc[0] === 1 && acc[1] === 0x50)) {
      const i = acc.indexOf(Buffer.from([1, 0x50]), 1);
      if (i < 0) { acc = acc.subarray(acc.length - 1); break; }
      acc = acc.subarray(i); if (acc.length < 121) break;
    }
    const fr = acc.subarray(0, 121);
    if (valid(fr)) { frames.push(Buffer.from(fr)); if (frames.length > 10) frames.shift(); if (frames.length >= 2) { const r = decode(frames[0], frames[frames.length - 1]); if (r) console.log(`Temp ${r.tempF.toFixed(1)}°F   Press ${r.psi.toFixed(2)} psig   (Ch0 ${r.ma[0].toFixed(2)}mA, Ch1 ${r.ma[1].toFixed(2)}mA)  ctr ${r.ctr}`); } acc = acc.subarray(121); }
    else acc = acc.subarray(1);
  }
});
ws.on('error', (e) => console.error('WS error:', e.message));
