import { NextResponse } from "next/server";
import { renderRunCsv, renderPassCsv } from "@/lib/exports";
import type { ExportPayload } from "@/lib/exports/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const flavor = url.searchParams.get("flavor") ?? "run"; // "run" | "pass"
  const payload = (await req.json()) as ExportPayload;

  const csv = flavor === "pass" ? renderPassCsv(payload) : renderRunCsv(payload);
  const suffix = flavor === "pass" ? "pass" : "run";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proving-${payload.meter.tag}-${payload.generatedAt.slice(0, 10)}-${suffix}.csv"`,
    },
  });
}
