// Server-only Modbus/TCP client for the P572 RMU. Uses Node's `net` — only
// import this from a route handler / server code, never from a client component.

import net from "node:net";
import {
  buildReadPdu,
  buildTcpFrame,
  registersFromBytes,
  P572_TCP_PORT,
  type RegBlock,
} from "./p572";

/**
 * Open one TCP connection and read the given register blocks sequentially.
 * Resolves with one number[] (16-bit registers) per requested block, in order.
 */
export function readBlocks(
  ip: string,
  unitId: number,
  blocks: RegBlock[],
  timeoutMs = 3000,
): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: ip, port: P572_TCP_PORT });
    sock.setNoDelay(true);

    const results: number[][] = [];
    let idx = 0;
    let txn = 0;
    let buf = Buffer.alloc(0);
    let done = false;

    const finish = (err?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      if (err) reject(err);
      else resolve(results);
    };

    const timer = setTimeout(
      () => finish(new Error(`Modbus/TCP timeout to ${ip}:${P572_TCP_PORT}`)),
      timeoutMs,
    );

    const sendNext = () => {
      const b = blocks[idx];
      txn = (txn + 1) & 0xffff;
      sock.write(Buffer.from(buildTcpFrame(txn, unitId, buildReadPdu(b.start, b.qty))));
    };

    sock.on("connect", () => sendNext());
    sock.on("error", (e) => finish(e));
    sock.on("close", () => finish(done ? undefined : new Error("connection closed early")));

    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      // Drain as many complete MBAP frames as arrived.
      while (buf.length >= 6) {
        const len = buf.readUInt16BE(4);
        if (buf.length < 6 + len) break;
        const frame = buf.subarray(0, 6 + len);
        buf = buf.subarray(6 + len);
        const pdu = frame.subarray(7);
        if (pdu[0] & 0x80) {
          finish(new Error(`Modbus exception 0x${pdu[1].toString(16)} reading block @${blocks[idx].start}`));
          return;
        }
        const byteCount = pdu[1];
        const dataBytes = pdu.subarray(2, 2 + byteCount);
        results.push(registersFromBytes(new Uint8Array(dataBytes)));
        idx += 1;
        if (idx >= blocks.length) {
          finish();
          return;
        }
        sendNext();
      }
    });
  });
}
