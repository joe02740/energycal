# Monday runbook — butane meter prove (LPG / TP-27 job)

**Two missions while PROVEit does the actual job:**
1. **The pulse capture** — one full Auto-Run set on Wireshark = the last bytes we
   need to finish the PIU decode (pulse counts per run).
2. **TP-27 ground truth** — butane runs PROVEit's "Table E – Light Hydrocarbons
   (TP-27)" math under real pressure. Screenshots of its numbers are the
   validation set for building LPG/butane/propane calc into Energy Cal
   (same way the L1A2 sheet validated the can calc).

## Do I need Wireshark? → YES (on the HP)
One serial cable = one master. While PROVEit runs the prove, USBPcap on the HP
is the only window into the traffic. `piu-run.js` is only for time ALONE with
the prover (optional bonus, not required).

## Night-before checklist (at home, ~30 min)
- [ ] HP: Wireshark still opens, **USBPcap interfaces** listed in the capture list
      (installed 6/5 — verify it survived updates; reinstall needs a reboot).
- [ ] HP: **install the dev setup** — git + Node + Claude Code + this repo, so
      analysis (and a possible Energy Cal run) happens on-site on the same
      machine as the COM port. Steps: **WORK-LAPTOP-SETUP.md** (15 min).
- [ ] HP: smoke test → `node serial-bridge/decode-prove.js proveit-capture.pcapng`
      prints "no monotonic counter found" = toolchain good.
- [ ] HP: disk space for a ~50–100 MB capture.
- [ ] Phone charged (screenshots are half the mission).
- [ ] Note from PROVEit setup pages: meter **K-factor** + prover **base volume**
      (decode-prove.js uses them to confirm the pulse field by arithmetic).

## At the prover — capture procedure
1. ATEN cable on the HP, PROVEit open but **NOT connected yet**.
2. Wireshark → select **all USBPcap interfaces** → **Start capture**.
3. PROVEit **Connect** → set up the butane proving task as normal.
4. Run the **complete Auto-Run set** (all runs to a final accepted MF — not 1 run).
5. Stop capture → **Save As `butane-prove.pcapng`** (Desktop or USB stick).
6. If anything restarts/disconnects mid-job: stop+save, start a NEW capture file
   (`butane-prove-2.pcapng`). Partial files are still gold.

## Screenshots to grab (the Rosetta Stone)
During/after the prove, photograph or snip:
- [ ] **Run table** — every column: Run No, Freq (M), N/Ni (pulse counts!), Tp/Tm/Pp/Pm,
      FlowRate, IMF, GSVp, ISVm, CCFp/CCFm, **CTSp, CPSp, CTLp, CPLp, CTLm, CPLm**
- [ ] **Product Data page** — product, **Table E/TP-27 selection, density + @temp,
      EVP / Equil. Vapor Press., base density**
- [ ] **Meter Characteristics** — K-factor (pulses/unit), nominal size, max flow
- [ ] **Prover page** — base volume, certified temp, pipe ID/wall/material
- [ ] **Results page** — final MF/CMF, repeatability %, run acceptance
- [ ] Analog Config screen if you open it (zero/span/offset per channel)

## The "room on the truck" play — our own run, same machine
After PROVEit's official runs are accepted and saved:
1. Analyze the capture right there:
   `node serial-bridge/decode-prove.js butane-prove.pcapng --kfactor <K> --provervol <gal>`
   → it prints the `pulseOffset` drop-in line (or open `claude` and ask).
2. Disconnect PROVEit (frees the COM port — same cable, same machine).
3. `node serial-bridge/piu-run.js COM? 9600` → live state/freq display.
4. Tell the operator "one more run" → press `l` twice (confirm-guarded launch =
   same action as Auto Run) → watch the pass; the pulse counter announces
   itself live; everything logs to `captures/`.
5. With `pulseOffset` set, the app's `runPass()` does the whole pass itself —
   a full Energy Cal auto-run with live product, validated against PROVEit's
   numbers from an hour earlier.

**Rule: one master.** Our tools touch the port only when PROVEit is disconnected.

## What happens after Monday
- Pulse field identified from the capture → `runPass()` → Energy Cal runs full
  auto provings over the same cable, no PROVEit.
- PROVEit's TP-27 CTL/CPL values per run → implement + validate Table E math →
  butane/propane/LPG proving native in Energy Cal.
