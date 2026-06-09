'use strict';

/**
 * List every serial port Windows can see, with friendly names so you can tell
 * the wired ATEN UC-232A adapter apart from the Bluetooth link.
 *
 *   node list-ports.js        (or  npm run list)
 *
 * On 2026-05-12: COM6 = "Standard Serial over Bluetooth link", and the wired
 * ATEN adapter showed up as COM4. Prolific adapters report manufacturer
 * "Prolific" / a "USB-to-Serial" friendly name — that's the one you want.
 */

const { SerialPort } = require('serialport');

SerialPort.list()
  .then((ports) => {
    if (!ports.length) {
      console.log('No serial ports found. Plug in the ATEN adapter and try again.');
      return;
    }
    console.log('');
    console.log('Path    Friendly name / manufacturer                 VID:PID');
    console.log('──────  ────────────────────────────────────────────  ───────────');
    for (const p of ports) {
      const name = p.friendlyName || p.manufacturer || p.pnpId || '(unknown)';
      const vidpid = p.vendorId ? `${p.vendorId}:${p.productId || '????'}` : '';
      const hint =
        /prolific|usb.*serial|aten|uc-?232/i.test(name) ? '  ← likely the ATEN adapter' :
        /bluetooth/i.test(name)                         ? '  (Bluetooth link)' : '';
      console.log(`${p.path.padEnd(6)}  ${String(name).slice(0, 44).padEnd(44)}  ${vidpid}${hint}`);
    }
    console.log('');
    console.log('Then launch the bridge on the right one, e.g.:  node bridge.js COM4 9600');
    console.log('');
  })
  .catch((err) => {
    console.error('Could not list ports:', err.message);
    process.exit(1);
  });
