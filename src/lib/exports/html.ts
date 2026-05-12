// Self-contained HTML certificate. Intentionally has no shadcn / Tailwind
// dependency — inlines styles so it renders identically when piped to
// Puppeteer (server-side PDF) or saved to disk as raw HTML.

import type { ExportPayload } from "./types";

const f = (n: number | null | undefined, d = 4) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(d);

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderHtmlCertificate(p: ExportPayload): string {
  const r = p.result;
  const date = new Date(p.generatedAt);
  const dateStr = date.toLocaleString();

  const passesRows = r.passes
    .map((pass) => {
      const status = pass.isWetDown
        ? '<span class="badge badge-muted">wet-down</span>'
        : pass.excluded
          ? '<span class="badge badge-muted">excluded</span>'
          : '<span class="badge badge-ok">ok</span>';
      return `
        <tr>
          <td>${pass.passNumber}</td>
          <td>${status}</td>
          <td class="num">${f(pass.imf, 5)}</td>
          <td class="num">${f(pass.gsvp, 4)}</td>
          <td class="num">${f(pass.isvm, 4)}</td>
          <td class="num">${f(pass.ivm, 4)}</td>
          <td class="num">${f(pass.ccfMeter, 6)}</td>
          <td class="num">${f(pass.ccfProver, 6)}</td>
        </tr>`;
    })
    .join("");

  const verdict = r.passed
    ? '<span class="verdict pass">PASS</span>'
    : '<span class="verdict fail">FAIL</span>';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Proving Certificate — ${escape(p.meter.tag)} — ${dateStr}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    color: #111827;
    background: #ffffff;
    font-size: 11px;
    line-height: 1.45;
    padding: 32px 40px;
  }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 13px; margin: 18px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .subtitle { color: #6b7280; font-size: 11px; margin-bottom: 18px; }
  .header-grid { display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 16px; margin-bottom: 8px; }
  .verdict { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 14px; letter-spacing: 0.05em; }
  .verdict.pass { background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7; }
  .verdict.fail { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .kv { display: flex; flex-direction: column; gap: 1px; }
  .kv .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  .kv .value { font-size: 12px; font-weight: 500; color: #111827; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
  th { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
  .badge-muted { background: #f3f4f6; color: #6b7280; }
  .badge-ok { background: #d1fae5; color: #065f46; }
  .summary-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-top: 8px; }
  .headline { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 8px; padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
  .headline .label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; }
  .headline .value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; }
  .warning { background: #fef3c7; border: 1px solid #fde68a; color: #92400e; padding: 8px 12px; border-radius: 6px; margin-top: 8px; font-size: 10px; }
  @media print {
    body { padding: 24px 28px; }
  }
</style>
</head>
<body>

<div class="header-grid">
  <div>
    <h1>Meter Proving Certificate</h1>
    <div class="subtitle">${escape(p.customer.name)} · ${escape(p.location.name)}${p.location.address ? ` · ${escape(p.location.address)}` : ""} · ${escape(dateStr)}</div>
  </div>
  ${verdict}
</div>

<div class="headline">
  <div><div class="label">MF</div><div class="value">${f(r.mf, 4)}</div></div>
  <div><div class="label">CMF</div><div class="value">${f(r.cmf, 4)}</div></div>
  <div><div class="label">KF</div><div class="value">${f(r.kf, 1)}</div></div>
  <div><div class="label">Repeatability</div><div class="value">${f(r.repeatabilityPct, 3)}%</div></div>
</div>

<div class="grid-2">
  <div>
    <h2>Meter</h2>
    <div class="kv"><span class="label">Tag</span><span class="value">${escape(p.meter.tag)}${p.meter.description ? ` — ${escape(p.meter.description)}` : ""}</span></div>
    <div class="kv"><span class="label">Manufacturer / Model / Serial</span><span class="value">${[p.meter.manufacturer, p.meter.model, p.meter.serialNumber].filter((x): x is string => Boolean(x)).map(escape).join(" / ") || "—"}</span></div>
    <div class="kv"><span class="label">K-factor (nominal)</span><span class="value">${p.meter.nominalKFactor} pulses/gal${p.meter.sizeIn ? ` · ${p.meter.sizeIn}″` : ""}</span></div>
  </div>
  <div>
    <h2>Prover</h2>
    <div class="kv"><span class="label">Tag</span><span class="value">${escape(p.prover.tag)}${p.prover.material ? ` (${escape(p.prover.material)})` : ""}</span></div>
    <div class="kv"><span class="label">Manufacturer / Model / Serial</span><span class="value">${[p.prover.manufacturer, p.prover.model, p.prover.serialNumber].filter((x): x is string => Boolean(x)).map(escape).join(" / ") || "—"}</span></div>
    <div class="kv"><span class="label">Base volume</span><span class="value">${p.prover.baseVolume} ${escape(p.prover.baseVolumeUnit)} · ID ${p.prover.pipeInternalDiameterIn ?? "—"}″ · Wall ${p.prover.pipeWallThicknessIn ?? "—"}″</span></div>
  </div>
</div>

<div class="grid-2" style="margin-top: 8px;">
  <div>
    <h2>Product &amp; Conditions</h2>
    <div class="kv"><span class="label">Product</span><span class="value">${escape(p.product.name)}${p.product.productType ? ` (${escape(p.product.productType)})` : ""}</span></div>
    <div class="kv"><span class="label">Density</span><span class="value">${p.conditions.densityApi} °API @ ${p.conditions.densityTempF}°F</span></div>
    <div class="kv"><span class="label">EVP / Hydrometer</span><span class="value">${p.conditions.evpPsig} psig · ${p.conditions.hydrometerCorrection ? "Yes" : "No"}</span></div>
  </div>
  <div>
    <h2>Acceptance</h2>
    <div class="kv"><span class="label">Profile</span><span class="value">${escape(p.acceptance.name)}</span></div>
    <div class="kv"><span class="label">Repeatability</span><span class="value">±${p.acceptance.repeatabilityTolerancePct}%</span></div>
    <div class="kv"><span class="label">Consistency</span><span class="value">${p.acceptance.consistencyRunsRequired} of ${p.acceptance.consistencyRunsMax}</span></div>
  </div>
</div>

<div class="grid-2" style="margin-top: 8px;">
  <div>
    <h2>Technician</h2>
    <div class="kv"><span class="label">Name</span><span class="value">${escape(p.contacts.techName)}</span></div>
    ${p.contacts.techCompany ? `<div class="kv"><span class="label">Company</span><span class="value">${escape(p.contacts.techCompany)}</span></div>` : ""}
    ${p.contacts.techEmail ? `<div class="kv"><span class="label">Email</span><span class="value">${escape(p.contacts.techEmail)}</span></div>` : ""}
  </div>
  <div>
    <h2>Witness</h2>
    <div class="kv"><span class="label">Name</span><span class="value">${escape(p.contacts.witnessName ?? "—")}</span></div>
    ${p.contacts.witnessCompany ? `<div class="kv"><span class="label">Company</span><span class="value">${escape(p.contacts.witnessCompany)}</span></div>` : ""}
    ${p.contacts.witnessEmail ? `<div class="kv"><span class="label">Email</span><span class="value">${escape(p.contacts.witnessEmail)}</span></div>` : ""}
  </div>
</div>

<h2>Per-pass</h2>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Status</th>
      <th class="num">IMF</th>
      <th class="num">GSVp</th>
      <th class="num">ISVm</th>
      <th class="num">IVm</th>
      <th class="num">CCFm</th>
      <th class="num">CCFp</th>
    </tr>
  </thead>
  <tbody>
    ${passesRows}
  </tbody>
</table>

<h2>Run-averaged corrections</h2>
<table>
  <thead>
    <tr>
      <th>Side</th>
      <th class="num">CTL</th>
      <th class="num">CPL</th>
      <th class="num">CTS</th>
      <th class="num">CPS</th>
      <th class="num">CCF</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Meter</td><td class="num">${f(r.ctlMeter, 6)}</td><td class="num">${f(r.cplMeter, 6)}</td><td class="num">—</td><td class="num">—</td><td class="num">${f(r.ccfMeter, 6)}</td></tr>
    <tr><td>Prover</td><td class="num">${f(r.ctlProver, 6)}</td><td class="num">${f(r.cplProver, 6)}</td><td class="num">${f(r.ctsProver, 6)}</td><td class="num">${f(r.cpsProver, 6)}</td><td class="num">${f(r.ccfProver, 6)}</td></tr>
  </tbody>
</table>

${r.warnings.length ? `<div class="warning"><strong>Warnings:</strong> ${r.warnings.map(escape).join(" · ")}</div>` : ""}

<div class="footer">
  <span>Energy Cal · ${escape(p.appVersion ?? "v0")}</span>
  <span>${p.shortHash ? `hash ${escape(p.shortHash)}` : ""}</span>
</div>

</body>
</html>`;
}
