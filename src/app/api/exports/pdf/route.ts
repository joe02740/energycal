// PDF certificate via Puppeteer.
//
// Strategy: render the same HTML certificate (lib/exports/html.ts) and pipe it
// to a headless browser. Two execution paths:
//
//   - Local dev (CHROME_PATH set, or system Chrome detected): use puppeteer-core
//     pointed at the local browser. Fast, no chromium download.
//   - Cloud Run / serverless (no system chrome): @sparticuz/chromium-min with
//     a CHROMIUM_BROWSER_DOWNLOAD_URL pointing at a hosted chromium tarball.
//
// For v0 the route just tries dev path first, then falls back to bundled
// chromium if available. If neither works, returns 503 with a clear message
// — frontend shows a hint to set CHROME_PATH.

import { NextResponse } from "next/server";
import { renderHtmlCertificate } from "@/lib/exports";
import type { ExportPayload } from "@/lib/exports/types";

export const runtime = "nodejs";
export const maxDuration = 60;

async function launchBrowser() {
  const puppeteer = await import("puppeteer-core");

  // Path 1: explicit CHROME_PATH env var (works on every OS)
  const chromePath = process.env.CHROME_PATH;
  if (chromePath) {
    return puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  // Path 2: try @sparticuz/chromium-min with a remote tarball URL.
  // Set CHROMIUM_BROWSER_DOWNLOAD_URL in Cloud Run to a hosted tarball.
  const remoteUrl = process.env.CHROMIUM_BROWSER_DOWNLOAD_URL;
  if (remoteUrl) {
    const chromium = (await import("@sparticuz/chromium-min")).default as unknown as {
      args: string[];
      executablePath: (url: string) => Promise<string>;
    };
    const executablePath = await chromium.executablePath(remoteUrl);
    return puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    });
  }

  // Path 3: probe a couple of well-known local locations on Windows / Mac / Linux.
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  const fs = await import("node:fs/promises");
  for (const path of candidates) {
    try {
      await fs.access(path);
      return puppeteer.launch({
        executablePath: path,
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    } catch {
      // try next
    }
  }
  throw new Error("no_chromium");
}

export async function POST(req: Request) {
  const payload = (await req.json()) as ExportPayload;
  const html = renderHtmlCertificate(payload);

  let browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "no_chromium") {
      return NextResponse.json(
        {
          error: "PDF rendering unavailable",
          hint: "Set CHROME_PATH to a Chrome/Chromium executable, or set CHROMIUM_BROWSER_DOWNLOAD_URL to a hosted @sparticuz/chromium tarball. Until then, use the HTML export and print to PDF locally.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Browser launch failed", detail: message }, { status: 500 });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.4in", bottom: "0.4in", left: "0.5in", right: "0.5in" },
    });
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="proving-${payload.meter.tag}-${payload.generatedAt.slice(0, 10)}.pdf"`,
      },
    });
  } finally {
    await browser.close().catch(() => {});
  }
}
