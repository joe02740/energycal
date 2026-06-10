# Putting the dev setup on the work laptop (HP) — before Monday

Goal: Claude Code + this repo live on the SAME machine as PROVEit, so after the
official runs the same COM port (ATEN cable already plugged in, driver already
working) can be driven by our tools — and Claude is on-site to read the data
and drop the pulse mapping in live.

## Install (≈15 min, needs internet — hotspot is fine)

1. **Git** — https://git-scm.com/download/win (defaults are fine)
2. **Node.js LTS** — https://nodejs.org (defaults; restart the terminal after)
3. **Claude Code** — PowerShell:
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
   then `claude` once to log in (Anthropic account).
4. **The repo**:
   ```powershell
   git clone https://github.com/joe02740/energycal.git
   cd energycal
   npm install
   cd serial-bridge
   npm install
   ```
5. **Smoke test** (no prover needed): `node serial-bridge/decode-prove.js proveit-capture.pcapng`
   should print "no monotonic counter found" — that means the toolchain works.

## Monday order of operations

1. **PROVEit does the official job** — Wireshark/USBPcap capturing the whole time
   (see BUTANE-JOB-RUNBOOK.md). The paying work is untouched.
2. Save the capture, then in the repo:
   ```powershell
   node serial-bridge/decode-prove.js C:\path\to\butane-prove.pcapng --kfactor <K> --provervol <gal>
   ```
   (K = meter K-factor pulses/gal from PROVEit's meter page; provervol = prover
   base volume.) It segments every pass, finds the counting field, and prints
   the `pulseOffset` line. Or just open `claude` and say "analyze the capture"
   — Claude reads the runbook + protocol notes from the repo.
3. **If there's room on the truck** — PROVEit disconnects (close it or
   disconnect the task), the COM port frees up, then:
   ```powershell
   node serial-bridge/piu-run.js COM? 9600     ← COM number from Device Manager
   ```
   live readings appear; tell the operator "one more run" — press `l` twice to
   launch (same action as PROVEit's Auto Run), watch the pass complete, and the
   pulse counter announces itself in real time. Claude patches `pulseOffset`,
   and the NEXT run can be a full Energy Cal auto-run pass.

## Boundaries that keep this clean
- Never two masters: our tools only touch the port when PROVEit is disconnected.
- `piu-run.js` launch is confirm-guarded; it physically cycles the prover —
  only with the line-up made and the operator in the loop.
- The official cert for the job comes from PROVEit as normal. Our runs are
  extra validation, not the deliverable.
