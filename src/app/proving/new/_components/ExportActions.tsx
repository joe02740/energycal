"use client";

import { useState } from "react";
import { Download, FileText, Sheet, FileCode2, Globe } from "lucide-react";
import type { RunProvingOutput } from "@/lib/calc";
import type {
  AcceptanceProfile,
  Customer,
  Location,
  Meter,
  Product,
  Prover,
} from "@/lib/data/types";
import type { ExportPayload } from "@/lib/exports/types";
import { useWizardStore } from "@/lib/wizard/store";
import { Button } from "@/components/ui/button";

interface ExportActionsProps {
  customer?: Customer;
  location?: Location;
  meter: Meter | null;
  prover: Prover | null;
  product: Product | null;
  acceptance: AcceptanceProfile | null;
  liveResult: RunProvingOutput | null;
}

function buildPayload(args: ExportActionsProps, contacts: ExportPayload["contacts"], conditions: ExportPayload["conditions"]): ExportPayload | null {
  if (!args.customer || !args.location || !args.meter || !args.prover || !args.product || !args.acceptance || !args.liveResult) {
    return null;
  }
  return {
    generatedAt: new Date().toISOString(),
    customer: { name: args.customer.name },
    location: { name: args.location.name, address: args.location.address },
    meter: {
      tag: args.meter.tag,
      description: args.meter.description,
      manufacturer: args.meter.manufacturer,
      model: args.meter.model,
      serialNumber: args.meter.serialNumber,
      nominalKFactor: args.meter.nominalKFactor,
      sizeIn: args.meter.sizeIn,
    },
    prover: {
      tag: args.prover.tag,
      manufacturer: args.prover.manufacturer,
      model: args.prover.model,
      serialNumber: args.prover.serialNumber,
      baseVolume: args.prover.baseVolume,
      baseVolumeUnit: args.prover.baseVolumeUnit,
      pipeInternalDiameterIn: args.prover.pipeInternalDiameterIn,
      pipeWallThicknessIn: args.prover.pipeWallThicknessIn,
      material: args.prover.material,
    },
    product: { name: args.product.name, productType: args.product.productType },
    acceptance: {
      name: args.acceptance.name,
      repeatabilityTolerancePct: args.acceptance.repeatabilityTolerancePct,
      consistencyRunsRequired: args.acceptance.consistencyRunsRequired,
      consistencyRunsMax: args.acceptance.consistencyRunsMax,
    },
    conditions,
    contacts,
    result: args.liveResult,
    appVersion: "v0",
  };
}

async function downloadPost(url: string, payload: ExportPayload): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const json = (await res.json()) as { error?: string; hint?: string };
      message = [json.error, json.hint].filter(Boolean).join(" — ") || message;
    } catch {
      // ignore JSON parse failures
    }
    return { ok: false, message };
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? "proving";
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return { ok: true };
}

export function ExportActions(props: ExportActionsProps) {
  const wiz = useWizardStore();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = !!props.liveResult && !!props.customer && !!props.meter && !!props.prover && !!props.product && !!props.acceptance && wiz.techName.trim().length > 0;

  const buildAndPost = async (kind: "md" | "csv-run" | "csv-pass" | "html" | "pdf") => {
    setError(null);
    const payload = buildPayload(
      props,
      {
        techName: wiz.techName,
        techCompany: wiz.techCompany || undefined,
        techEmail: wiz.techEmail || undefined,
        techPhone: wiz.techPhone || undefined,
        witnessName: wiz.witnessName || undefined,
        witnessCompany: wiz.witnessCompany || undefined,
        witnessEmail: wiz.witnessEmail || undefined,
        witnessPhone: wiz.witnessPhone || undefined,
      },
      {
        densityApi: typeof wiz.densityApi === "number" ? wiz.densityApi : 0,
        densityTempF: typeof wiz.densityTempF === "number" ? wiz.densityTempF : 60,
        densityPressurePsig: typeof wiz.densityPressurePsig === "number" ? wiz.densityPressurePsig : 0,
        evpPsig: typeof wiz.evpPsig === "number" ? wiz.evpPsig : 0,
        hydrometerCorrection: wiz.hydrometerCorrection,
      },
    );
    if (!payload) return;
    setBusy(kind);
    const url =
      kind === "md"        ? "/api/exports/md" :
      kind === "csv-run"   ? "/api/exports/csv?flavor=run" :
      kind === "csv-pass"  ? "/api/exports/csv?flavor=pass" :
      kind === "html"      ? "/api/exports/html" :
      "/api/exports/pdf";
    const result = await downloadPost(url, payload);
    if (!result.ok) setError(result.message ?? "Download failed");
    setBusy(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="default"
          onClick={() => buildAndPost("pdf")}
          disabled={!ready || busy !== null}
        >
          <Download className="mr-2 h-4 w-4" />
          {busy === "pdf" ? "Rendering PDF…" : "PDF"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => buildAndPost("html")}
          disabled={!ready || busy !== null}
        >
          <Globe className="mr-2 h-4 w-4" />
          HTML
        </Button>
        <Button
          variant="secondary"
          onClick={() => buildAndPost("md")}
          disabled={!ready || busy !== null}
        >
          <FileText className="mr-2 h-4 w-4" />
          Markdown
        </Button>
        <Button
          variant="secondary"
          onClick={() => buildAndPost("csv-run")}
          disabled={!ready || busy !== null}
        >
          <Sheet className="mr-2 h-4 w-4" />
          CSV (run)
        </Button>
        <Button
          variant="secondary"
          onClick={() => buildAndPost("csv-pass")}
          disabled={!ready || busy !== null}
        >
          <FileCode2 className="mr-2 h-4 w-4" />
          CSV (passes)
        </Button>
      </div>
      {!ready && (
        <p className="text-xs text-muted-foreground">
          Fill in tech name, conditions, and at least one pass to enable exports.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
