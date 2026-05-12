import { NextResponse } from "next/server";
import { renderMarkdown } from "@/lib/exports";
import type { ExportPayload } from "@/lib/exports/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const payload = (await req.json()) as ExportPayload;
  const md = renderMarkdown(payload);
  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="proving-${payload.meter.tag}-${payload.generatedAt.slice(0, 10)}.md"`,
    },
  });
}
