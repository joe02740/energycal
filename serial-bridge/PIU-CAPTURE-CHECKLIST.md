# PIU run layer — what's decoded, what one real prove still confirms

**Update 2026-06-09:** re-analysis of the two existing captures cracked most of the
run layer — both contained an Auto Run press. What we now KNOW:

| Piece | Status | Detail |
|---|---|---|
| **Launch command** | ✅ DECODED | `50 35` (P5), sent once at Auto Run. Ack `01 50 99 e9`. Fires DIGOUT1 (500 ms launch pulse / fwd-rev valve per manual). Also clears the freq fields. |
| **Run state** | ✅ DECODED | Status byte (P4[6], also `50 3c` resp[6]): `0x83` idle ↔ `0x03` run-active (bit 7 clears on launch). |
| **Frequency** | ✅ DECODED (tick rate provisional) | P4[16..19] = ch-1 period, P4[24..27] = ch-2 period (uint32 LE, ~40 MHz ticks → Hz = 40e6/ticks); P4[28..31] = integer Hz. Idle captures show ~62 Hz mains noise on the floating inputs — matches PROVEit's "Channel A ~60Hz". |
| **Pulse counts per run** | ⏳ LAST GAP | Fields zeroed at launch; never advanced in the captures because no detector hit ever started a measured pass. Candidates: [16..27] switching period→count mode, or the zeroed [32..55] block. |
| **Detector switch bit** | ⏳ confirm | Almost certainly in the status byte / nearby — flips on a real sphere pass. |

The app side is ready: `PiuRs232Controller.launch()` sends P5 and waits for the ack;
the decoder reads state + both frequency channels live.

## First real try — use `piu-run.js` (no PROVEit needed)

```
node serial-bridge/piu-run.js COM6 9600
```

- Live line: status (idle/RUN-ACTIVE), freq channels, all 6 analog mA, counter.
- It prints `*** UNMAPPED BYTES CHANGED` the moment ANY byte outside the known
  fields moves — **that's the pulse counter identifying itself** during a real pass.
- `l` (twice, confirm) sends LAUNCH. ⚠ This MOVES the prover — line-up made,
  hydraulics safe, same as pressing Auto Run in PROVEit.
- Everything logs to `serial-bridge/captures/piu-run-*.log` — bring that file back
  and the pulse mapping drops out of it.

⚠ `piu.js` (the register prober) no longer probes `50 35` — probing it WAS firing
the launch output on every run of the tool.

## Fallback: capture PROVEit doing a full prove (as before)

If the first try happens on PROVEit anyway, a USBPcap capture of one complete
Auto-Run proving (all runs to a final MF) gives the same answer offline:
start capture → Connect → full Auto Run set → save `proveit-prove.pcapng`.
Note alongside: per-run pulse counts (N/Ni), Freq (M), meter K-factor, prover
base volume — to sanity-check pulses → volume.

## What drops out after that
Pulse field mapped → `runPass()` implemented → the app runs full automatic
provings (launch, watch detectors, count pulses, compute MF) over the same
RS-232 cable — no PROVEit.
