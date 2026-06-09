# Builds the portable Windows bundle at dist\EnergyCal.
#   - app\        the Next.js standalone server (self-contained, no npm install)
#   - node\       a bundled Node.js runtime (node.exe) so the target PC needs nothing
#   - launchers   Start/Stop .bat + README
#
# Run:  powershell -ExecutionPolicy Bypass -File scripts\package-portable.ps1
# Then copy the whole dist\EnergyCal folder to a thumb drive.

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

Write-Host "[1/4] next build (standalone output)..."
npm run build | Out-Host
if ($LASTEXITCODE -ne 0) { throw "next build failed" }

$std = Join-Path $repo ".next\standalone"
Write-Host "[2/4] folding static + public into the standalone server..."
Copy-Item (Join-Path $repo ".next\static") (Join-Path $std ".next\static") -Recurse -Force
if (Test-Path (Join-Path $repo "public")) {
  Copy-Item (Join-Path $repo "public") (Join-Path $std "public") -Recurse -Force
}

$out = Join-Path $repo "dist\EnergyCal"
Write-Host "[3/4] assembling portable bundle at $out ..."
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $out "app"), (Join-Path $out "node") | Out-Null
robocopy $std (Join-Path $out "app") /E /NFL /NDL /NJH /NJS /NP | Out-Null
Copy-Item (Get-Command node).Source (Join-Path $out "node\node.exe") -Force
Copy-Item (Join-Path $PSScriptRoot "portable\*") $out -Force

$mb = [math]::Round(((Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum / 1MB))
Write-Host "[4/4] done."
Write-Host ("Portable bundle ready: {0}  (~{1} MB)" -f $out, $mb)
Write-Host "Copy the whole 'EnergyCal' folder to a thumb drive, then run 'Start Energy Cal.bat'."
