"use client";

import type { CanRunResult } from "@/lib/calc/can/canProving";
import type { CanHeader, CanRunRow } from "../types";

interface CanCertProps {
  header: CanHeader;
  rows: CanRunRow[];
  results: (CanRunResult | null)[];
  finalMeterFactor: number | null;
  newMeterFactor: number | null;
  avgErrorGal: number | null;
  avgCubicIn: number | null;
  repeatability: { passed: boolean; diff: number; avg: number } | null;
  brand: {
    name: string;
    legalName?: string;
    accent?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
    logoUrl?: string;
  };
  generatedAt: string;
}

const f = (v: number | null | undefined, dp: number) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(dp);

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium leading-tight">{value === "" || value == null ? "—" : value}</span>
    </div>
  );
}

function Result({
  label,
  value,
  emphasize,
  tone,
}: {
  label: string;
  value: string | number;
  emphasize?: boolean;
  tone?: "good" | "warn";
}) {
  const color = tone === "good" ? "text-green-700" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className={`rounded border p-2 ${emphasize ? "border-black bg-black/[0.03]" : "border-black/20"}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-4 border-b border-foreground/20 pb-1 text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
      {children}
    </h2>
  );
}

/**
 * Combined can-proving certificate — the Excel "METER TEST PROVING RECORD" A–P
 * math laid out in PROVEit's sectioned, branded report style. Print-optimized.
 */
export function CanCert({ header, rows, results, finalMeterFactor, newMeterFactor, avgErrorGal, avgCubicIn, repeatability, brand, generatedAt }: CanCertProps) {
  const active = rows.map((r, i) => ({ r, res: results[i], i })).filter((x) => x.res !== null);

  return (
    <div className="cert-sheet mx-auto max-w-[8.5in] bg-white p-8 text-black print:max-w-none print:p-[0.5in]">
      {/* Branded header */}
      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div className="flex flex-col gap-1">
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} className="h-12 w-auto" />
          ) : (
            <div className="text-lg font-bold leading-tight">{brand.legalName ?? brand.name}</div>
          )}
          <div className="text-[10px] leading-tight text-muted-foreground">
            {brand.contactAddress ? <div>{brand.contactAddress}</div> : null}
            <div className="flex flex-wrap gap-x-2">
              {brand.contactPhone ? <span>{brand.contactPhone}</span> : null}
              {brand.contactEmail ? <span>{brand.contactEmail}</span> : null}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold uppercase tracking-wide">Meter Test Proving Record</div>
          <div className="text-[11px] text-muted-foreground">Can / Tank Prover · API MPMS Ch. 4.4</div>
          {header.certNo ? <div className="text-[11px]">Cert #{header.certNo}</div> : null}
        </div>
      </header>

      {/* Identification */}
      <SectionTitle>Identification</SectionTitle>
      <div className="grid grid-cols-4 gap-x-4 gap-y-2">
        <Field label="Customer" value={header.customer} />
        <Field label="Site / Terminal" value={header.location} />
        <Field label="Address" value={header.address} />
        <Field label="Product" value={header.product} />
        <Field label="Date of Test" value={header.testDate} />
        <Field label="Last Test Date" value={header.lastTestDate} />
        <Field label="Throughput Since" value={header.throughputSince} />
        <Field label="Performed By" value={header.performedBy} />
      </div>

      {/* Meter + Prover */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <SectionTitle>Meter</SectionTitle>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Make" value={header.meterMake} />
            <Field label="Model" value={header.meterModel} />
            <Field label="Size" value={header.meterSize} />
            <Field label="ID #" value={header.meterId} />
            <Field label="Seal #" value={header.meterSeal} />
            <Field label="Previous Meter Factor" value={header.previousMeterFactor} />
          </div>
        </div>
        <div>
          <SectionTitle>Prover &amp; Product</SectionTitle>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Field label="Prover Serial #" value={header.proverSerial} />
            <Field label="Prover Size" value={header.proverSize} />
            <Field label="Product Gravity (°API)" value={header.gravity} />
            <Field label="Last Totalizer" value={header.lastTotalizer} />
            <Field label="This Test Start" value={header.startTotalizer} />
            <Field label="This Test Finish" value={header.finishTotalizer} />
          </div>
        </div>
      </div>

      {/* Run data — the A–P table */}
      <SectionTitle>Run Data</SectionTitle>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-1.5 font-semibold">Run</th>
            <th className="py-1 pr-1.5 text-right font-semibold">Flow&nbsp;gpm</th>
            <th className="py-1 pr-1.5 text-right font-semibold">A Tank&nbsp;gal</th>
            <th className="py-1 pr-1.5 text-right font-semibold">C Avg&nbsp;°F</th>
            <th className="py-1 pr-1.5 text-right font-semibold">D CTS</th>
            <th className="py-1 pr-1.5 text-right font-semibold">E CTL</th>
            <th className="py-1 pr-1.5 text-right font-semibold">F Net&nbsp;Prv</th>
            <th className="py-1 pr-1.5 text-right font-semibold">G Meter</th>
            <th className="py-1 pr-1.5 text-right font-semibold">J Net&nbsp;Mtr</th>
            <th className="py-1 pr-1.5 text-right font-semibold">K Err&nbsp;gal</th>
            <th className="py-1 pr-1.5 text-right font-semibold">L Err&nbsp;%</th>
            <th className="py-1 pr-1.5 text-right font-semibold">M Cu&nbsp;in</th>
            <th className="py-1 pr-1.5 text-right font-semibold">N MF</th>
          </tr>
        </thead>
        <tbody>
          {active.map(({ r, res, i }) => (
            <tr key={i} className="border-b border-foreground/15">
              <td className="py-1 pr-1.5">
                {i + 1}
                {r.wetDown ? <span className="ml-1 text-[9px] uppercase text-muted-foreground">(wet)</span> : null}
              </td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{r.flowGpm.trim() || "—"}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.tankGross, 2)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.avgTemp, 1)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.cts, 5)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.ctlProver, 5)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.netProver, 2)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.meterGross, 2)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.netMeter, 2)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.errorGal, 2)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.errorPct, 4)}</td>
              <td className="py-1 pr-1.5 text-right tabular-nums">{f(res!.cubicInches, 1)}</td>
              <td className="py-1 pr-1.5 text-right font-semibold tabular-nums">{f(res!.meterFactor, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[9px] text-muted-foreground">
        F = A·CTS·CTL · J = G·CTL(invoice) · K = F−J · L = K/J·100 · M = K·231&nbsp;in³ · MF = F/J ·
        new meter factor = avg&nbsp;MF × previous factor. Open-can atmospheric prover: no pressure correction (CPS/CPL = 1).
      </p>

      {/* Results */}
      <SectionTitle>Results</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        <Result label="Previous Meter Factor" value={header.previousMeterFactor || "—"} />
        <Result label="Avg Meter Factor (as found)" value={f(finalMeterFactor, 4)} />
        <Result label="New Meter Factor" value={f(newMeterFactor, 5)} emphasize />
        <Result label="Avg Error (gal)" value={f(avgErrorGal, 2)} />
        <Result label="Avg Error (cubic in)" value={f(avgCubicIn, 1)} />
        <Result
          label={`Repeatability Δ${repeatability ? ` · ${repeatability.passed ? "PASS" : "REVIEW"}` : ""}`}
          value={repeatability ? f(repeatability.diff, 4) : "—"}
          tone={repeatability ? (repeatability.passed ? "good" : "warn") : undefined}
        />
      </div>

      {header.comments ? (
        <>
          <SectionTitle>Comments</SectionTitle>
          <p className="whitespace-pre-wrap text-[12px]">{header.comments}</p>
        </>
      ) : null}

      {/* Signatures */}
      <div className="mt-8 grid grid-cols-2 gap-10">
        <div>
          <div className="border-t border-black pt-1 text-[11px]">{header.performedBy || " "}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Performed By</div>
        </div>
        <div>
          <div className="border-t border-black pt-1 text-[11px]">{header.witness || " "}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Witness</div>
        </div>
      </div>

      <footer className="mt-6 border-t border-foreground/20 pt-2 text-[9px] text-muted-foreground">
        Generated {generatedAt} · Energy Cal · CTS per Shelltable (steel, integer °F, 60 °F = 1.0000);
        CTL per worksheet coefficient K₀ = 594.5418. Values reproduce the source Excel record.
      </footer>
    </div>
  );
}
