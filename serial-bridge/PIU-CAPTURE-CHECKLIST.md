# Finishing the PIU decode — one capture during a real prove

**Goal:** ONE Wireshark/USBPcap capture of PROVEit running a *complete* Auto-Run proving.
That single capture has every byte for the pieces we don't have yet — the **Launch
command**, **detector-switch states**, **pulse counts per run**, **frequency**, and
**run completion (IMF/MF)**. I decode it offline the same way I did temp/pressure, and
then the app reads *and commands* full runs over the ATEN cable.

**When:** needs a real job — a meter actually flowing and a prover running passes (product
going somewhere). Can't be done dry.

## Setup
- ATEN on the **HP** (PROVEit's machine), DB9 on the panel as normal.
- PROVEit open but **NOT connected yet**.
- Wireshark + USBPcap already installed.

## Capture
1. **Start the USBPcap capture** in Wireshark (select all USBPcap interfaces) **before**
   clicking Connect.
2. In PROVEit, click **Connect**.
3. Run a **complete Auto-Run proving** — let it do **all** its runs (the full consistency
   set, e.g. 5), not just one. Repetition lets me confirm the run-cycle structure.
4. Let it finish to a **final meter factor** (runs accepted, repeatability passed).
5. **Stop** the capture → Save As **`proveit-prove.pcapng`** to OneDrive Desktop (or the
   repo root).

## Note alongside (the Rosetta Stone — screenshots are perfect)
- **During a run:** PROVEit's Freq (M), Flow Rate (M), Tp / Pp / Tm / Pm.
- **At each run's completion:** per-run pulse count (N/Ni), IMF; and at the end MF/CMF and
  repeatability %.
- **Meter K-factor** (pulses/gal) and **prover base volume** (gal/bbl) from the setup
  screens — lets me sanity-check pulses → volume.

## Send me
The `.pcapng` + the screenshots. That's the last capture we need.

## What I'll pull out of it
- The **Launch** command (OUT bytes the instant Auto Run is pressed).
- The **detector / prover-state** register (what changes during the sweep — likely the
  `P<` status bit flipping `0x83↔0x03`).
- The **pulse accumulator** field (increments during flow → frequency + per-run count).
- **Run completion** values PROVEit records per run.
→ Then the app does full proving over the RS-232 you already have.
