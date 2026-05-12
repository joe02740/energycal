import { NextResponse } from "next/server";
import { renderHtmlCertificate } from "@/lib/exports";
import type { ExportPayload } from "@/lib/exports/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const payload = (await req.json()) as ExportPayload;
  const html = renderHtmlCertificate(payload);
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="proving-${payload.meter.tag}-${payload.generatedAt.slice(0, 10)}.html"`,
    },
  });
}
