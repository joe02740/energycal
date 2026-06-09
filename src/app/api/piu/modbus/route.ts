// Server-side Modbus/TCP read for the P572 RMU. The browser can't open raw TCP
// sockets, so the client controller POSTs here and the Node runtime talks Modbus
// to the RMU over Ethernet, returning a decoded reading.
//
// POST body: { ip: string, unitId?: number }
// Response:  { ok: true, reading: P572Reading } | { ok: false, error: string }

import { NextResponse } from "next/server";
import { readBlocks } from "@/lib/piu/modbus/tcpClient";
import { BLOCKS, decodeReading, P572_DEFAULT_UNIT } from "@/lib/piu/modbus/p572";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache a live hardware read

export async function POST(req: Request) {
  let body: { ip?: string; unitId?: number };
  try {
    body = (await req.json()) as { ip?: string; unitId?: number };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const ip = body.ip?.trim();
  if (!ip) {
    return NextResponse.json({ ok: false, error: "missing 'ip'" }, { status: 400 });
  }
  const unitId = Number.isFinite(Number(body.unitId)) ? Number(body.unitId) : P572_DEFAULT_UNIT;

  try {
    const [floats, scaled] = await readBlocks(ip, unitId, [BLOCKS.floats, BLOCKS.scaled]);
    const reading = decodeReading({ floats, scaled });
    return NextResponse.json({ ok: true, reading });
  } catch (e) {
    const error = e instanceof Error ? e.message : "modbus read failed";
    // 502: we reached the route but couldn't talk to the RMU (timeout/refused/etc.)
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}
