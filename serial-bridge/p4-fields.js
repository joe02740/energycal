'use strict';

/**
 * Read the 6 P4 channel fields as INSTANTANEOUS values, using the delta method
 * (Δaccumulator / Δcounter between two polls) so a value that just changed shows
 * up immediately — unlike acc/count which is the average since connect.
 *
 *   node p4-fields.js [COM_PORT] [knownTempF] [knownPsig]
 */

const { SerialPort } = require('serialport');
const PORT = process.argv[2] || 'COM6';
const KT = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const KP = process.argv[4] !== undefined ? Number(process.argv[4]) : null;

const FIELD_OFF = [60, 68, 76, 84, 92, 100]; // 6 uint32 fields
const CTR_OFF = 56;

const port = new SerialPort({ path: PORT, baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, autoOpen: false });

function pollP4(timeoutMs = 700) {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = () => { if (done) return; done = true; port.removeListener('data', onData); clearTimeout(to); resolve(buf); };
    const onData = (d) => { buf = Buffer.concat([buf, d]); if (buf.length >= 121) finish(); };
    port.on('data', onData);
    const to = setTimeout(finish, timeoutMs);
    port.write(Buffer.from([0x50, 0x34]));
  });
}
const valid = (b) => { if (b.length < 121 || b[0] !== 1 || b[1] !== 0x50) return false; let s = 0; for (let i = 1; i < b.length - 1; i++) s = (s + b[i]) & 0xff; return s === b[b.length - 1]; };
const fields = (f) => FIELD_OFF.map((o) => f.readUInt32LE(o));
const ctr = (f) => f.readUInt32LE(CTR_OFF);

(async () => {
  await new Promise((r, j) => port.open((e) => (e ? j(e) : r())));
  port.set({ dtr: true, rts: false }, () => {});

  const frames = [];
  const t0 = Date.now ? null : null; // Date.now is fine in a normal node script
  // poll for ~5 seconds
  const start = process.hrtime.bigint();
  while (Number(process.hrtime.bigint() - start) / 1e9 < 5) {
    const f = await pollP4();                 // eslint-disable-line no-await-in-loop
    if (valid(f)) frames.push(f);
    await new Promise((r) => setTimeout(r, 400)); // eslint-disable-line no-await-in-loop
  }
  if (frames.length < 2) { console.log('Not enough frames — is the ATEN on ' + PORT + ' and PROVEit closed?'); port.close(() => process.exit(1)); return; }

  const a = frames[0], b = frames[frames.length - 1];
  const fa = fields(a), fb = fields(b);
  const dc = ctr(b) - ctr(a);
  console.log(`Polled ${frames.length} frames. counter ${ctr(a)} → ${ctr(b)} (Δ=${dc})`);
  if (KT !== null || KP !== null) console.log(`Known now: ${KT !== null ? 'Temp=' + KT + '°F' : ''} ${KP !== null ? 'Press=' + KP + ' psig' : ''}`);
  console.log('');
  console.log('  field  offset   cumul(acc/count)   INSTANT(Δacc/Δcount)');
  const inst = [];
  for (let i = 0; i < 6; i++) {
    const cumul = fb[i] / ctr(b);
    const ins = dc > 0 ? (fb[i] - fa[i]) / dc : NaN;
    inst.push(ins);
    console.log(`   ${i + 1}     [${String(FIELD_OFF[i]).padStart(3)}]   ${cumul.toFixed(1).padStart(12)}   ${ins.toFixed(1).padStart(14)}`);
  }

  // If both points known, suggest which field matches and a 2-point scale later.
  if (KT !== null) {
    const best = inst.map((v, i) => ({ i, v })).filter((x) => Number.isFinite(x.v) && x.v > 1000);
    console.log('\n  Candidate TEMP field (large instant value): ' +
      best.map((x) => `f${x.i + 1}=${x.v.toFixed(0)} → ÷${(x.v / KT).toFixed(1)}=${KT}`).join('   '));
  }
  if (KP !== null) {
    console.log('  Candidate PRESS field (the one that JUMPED from ~32): compare to the 0.1-psig baseline [32,32].');
  }
  port.close(() => process.exit(0));
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
