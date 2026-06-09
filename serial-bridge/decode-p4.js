'use strict';

/**
 * Live P4 field-finder. Polls the RMU's P4 block several times, finds the bytes
 * that hold steady (analog inputs hold; counters/accumulators move), then hunts
 * every 16/32-bit window for the known live values you read off the prover.
 *
 *   node decode-p4.js [COM_PORT] [proverTempF] [proverPsig]
 *   node decode-p4.js COM6 97.2 0.1
 */

const { SerialPort } = require('serialport');

const PORT = process.argv[2] || 'COM6';
const T_TEMP = Number(process.argv[3] ?? 97.2);
const T_PRESS = Number(process.argv[4] ?? 0.1);

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

function near(a, b, tol) { return Math.abs(a - b) <= tol; }

(async () => {
  await new Promise((r, j) => port.open((e) => (e ? j(e) : r())));
  port.set({ dtr: true, rts: false }, () => {});

  const frames = [];
  for (let i = 0; i < 8; i++) {
    const f = await pollP4();             // eslint-disable-line no-await-in-loop
    if (valid(f)) frames.push(f);
    await new Promise((r) => setTimeout(r, 200)); // eslint-disable-line no-await-in-loop
  }
  if (frames.length < 2) { console.log(`Only ${frames.length} valid frames — is the ATEN on ${PORT} and PROVEit closed?`); port.close(() => process.exit(1)); return; }
  console.log(`Got ${frames.length} valid P4 frames. Looking for Tp≈${T_TEMP}°F and Pp≈${T_PRESS} psig.\n`);

  const len = 121;
  const stable = [];
  for (let i = 0; i < len; i++) {
    const v0 = frames[0][i];
    stable[i] = frames.every((f) => f[i] === v0);
  }

  const f = frames[0];
  console.log('Offset:  u16LE     u32LE        f32LE       (stable?)   ← matches');
  for (let i = 0; i + 4 <= len; i++) {
    const u16 = f.readUInt16LE(i);
    const u32 = f.readUInt32LE(i);
    const f32 = f.readFloatLE(i);
    const allStable = stable[i] && stable[i + 1] && stable[i + 2] && stable[i + 3];

    const hits = [];
    // temperature candidates
    if (near(f32, T_TEMP, 0.3)) hits.push(`TEMP f32=${f32.toFixed(3)}`);
    if (u16 === Math.round(T_TEMP * 10) || u32 === Math.round(T_TEMP * 10)) hits.push(`TEMP x10=${Math.round(T_TEMP * 10)}`);
    if (u16 === Math.round(T_TEMP * 100) || u32 === Math.round(T_TEMP * 100)) hits.push(`TEMP x100=${Math.round(T_TEMP * 100)}`);
    if (u16 === Math.round(T_TEMP) && T_TEMP >= 1) hits.push(`TEMP int=${Math.round(T_TEMP)}`);
    // pressure candidates
    if (near(f32, T_PRESS, 0.02)) hits.push(`PRESS f32=${f32.toFixed(4)}`);
    if (T_PRESS > 0) {
      if (u16 === Math.round(T_PRESS * 100) || u32 === Math.round(T_PRESS * 100)) hits.push(`PRESS x100=${Math.round(T_PRESS * 100)}`);
      if (u16 === Math.round(T_PRESS * 1000) || u32 === Math.round(T_PRESS * 1000)) hits.push(`PRESS x1000=${Math.round(T_PRESS * 1000)}`);
    }

    if (hits.length || (allStable && (u32 !== 0))) {
      const f32s = Number.isFinite(f32) && Math.abs(f32) < 1e9 && Math.abs(f32) > 1e-6 ? f32.toExponential(3) : String(f32);
      console.log(
        `  [${String(i).padStart(3)}]  ${String(u16).padStart(6)}  ${String(u32).padStart(11)}  ${f32s.padStart(12)}   ${allStable ? 'stable' : '      '}   ${hits.join('  ')}`,
      );
    }
  }

  console.log('\nFull frame 0 (hex):');
  console.log('  ' + [...f].map((x) => x.toString(16).padStart(2, '0')).join(' '));
  port.close(() => process.exit(0));
})().catch((e) => { console.error('error:', e.message); process.exit(1); });
