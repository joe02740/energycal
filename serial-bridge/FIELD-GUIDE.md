# Newflow P572 RMU — Field Bring-up Guide

The prover's "µ³ RMU" is a **Newflow P572 RMU (NANO RTU2)** — the box Quorum/Flow-Cal
**PROVEit** talks to. Manuals are in `serial-bridge/p572-docs/`. Everything here runs
**locally, no internet** once set up.

## The one thing that explains everything: the SW1 rotary switch

The P572 has a front-panel rotary switch (**SW1**, under the lid, next to the Ethernet
port) that sets its entire personality:

| SW1 | Mode | How you talk to it | Notes |
|---|---|---|---|
| **0** | PIU (6 mA in) | COM1 RS232 9600 8N1, **proprietary** | what PROVEit uses; format undocumented |
| F / E | PIU (5/1, 4/2) | same | voltage-input variants |
| **C** | **RTU** | **Modbus** (Ethernet/RS485/RS422), full web | **← use this**: addr 1, web config |
| D | RTU read-only | Modbus, web read-only | addr 1 |
| **1–9** | RTU | Modbus, slave address = the number | COM1 RS232 is dead in RTU |

On 2026-05-12 the unit was in **PIU mode**, so PROVEit was speaking a proprietary
protocol — that's why passive listening got nothing. **Flipping SW1 to RTU turns it into
a standard, fully-documented Modbus device** — and that's our long-term path (replacing
PROVEit).

> ⚠ **Before you touch SW1, note its current position so you can restore it.** PROVEit
> needs PIU mode (position **0**). When done testing Modbus, return SW1 to its original
> position and power-cycle.

---

## First-time setup on the HP (do TONIGHT, on real internet)

1. **Install Node.js LTS** — `.msi` from <https://nodejs.org>.
2. **Unzip `serial-bridge-portable.zip`** (on your Desktop) to `C:\serial-bridge`.
   `node_modules` is inside — **no `npm install`**.
3. Verify offline: `cd C:\serial-bridge` then `node modbus.js selftest` → should print
   `✓ frame + CRC correct`.

### Tonight's downloads — both paths

| For… | Download | Why |
|---|---|---|
| **Path A (Modbus/Ethernet)** | An **Ethernet cable** + **MicroConf** (Newflow's free discovery tool, from <https://docs.newflow.co.uk> or your vendor) | find/connect the RMU over Ethernet — no wiring |
| **Path B (capture PIU)** | **Wireshark** + **USBPcap** (tick it during install) | sniff PROVEit's proprietary bytes |
| Both | **Node.js LTS** | runs the tools |

---

## PATH A — Modbus over Ethernet (recommended, NO WIRING) ★

This is the strategic path (your app replaces PROVEit). It needs only an Ethernet cable.

1. **Note SW1's current position** (likely 0). Write it down.
2. Turn **SW1 → C**. **Power-cycle** the RMU.
3. Plug an **Ethernet cable** from the HP to the RMU's Ethernet port.
4. **Find the RMU's IP:** run **MicroConf** (it discovers the unit and shows its IP), or:
   - if your network has DHCP, check your router/`arp -a`;
   - direct laptop↔RMU with no DHCP: the RMU falls back to **10.255.255.255 / 255.255.255.0**.
     Set the laptop's NIC to a static `10.255.255.254 / 255.255.255.0`, then use `10.255.255.255`.
5. **Instant no-code check:** open `http://<rmu-ip>/` in a browser → the RMU's built-in
   **Diagnostics page** shows live Tm/Pm/Tp/Pp/freq/digital inputs. If you see live values
   here, the device is healthy and we're golden.
6. **Poll it with our tool:**
   ```
   node modbus.js tcp <rmu-ip>
   ```
   Prints Freq A/B/C, AnIn1–6 (mA), digital inputs (incl. DI9 = Detector), prover status,
   once a second, and logs to `captures/`. AnIn1–4 are PROVEit Channels 0–3
   (typically Meter Temp / Meter Press / Prover Temp / Prover Press — match against the
   values PROVEit showed: ~63.4°F temps, ~0.2 psig pressures).
7. **When done:** SW1 → **0** (original), power-cycle → PROVEit works again.

If `modbus.js` times out: wrong IP, or unit not actually in RTU mode (re-check SW1 +
power-cycle), or unit address ≠ 1 (try `node modbus.js tcp <ip> <addr>`).

---

## PATH B — Capture PIU from PROVEit (fallback, keeps PROVEit running)

Use this if you can't/don't want to switch the unit out of PIU mode. It learns the
proprietary protocol PROVEit speaks so we can replay it.

1. Leave **SW1 in PIU** (0/F/E). Confirm PROVEit still works.
2. Start a **Wireshark/USBPcap** capture on the ATEN adapter's USB.
3. In PROVEit, hit **Connect**. The first **host→device (USB BULK OUT)** transfer after
   the port-setup is PROVEit's PIU command. The **IN** transfer is the device's reply.
4. Also press **Launch** once — capture that OUT frame too (it's the prove-trigger command).
5. Save the `.pcapng` (both directions) and send it to me. Note PROVEit's on-screen
   Tm/Pm/Tp/Pp/Flow/Freq next to the timestamps so I can map bytes → values.

Once we have the PIU bytes, we replay them over the RS232 bridge:
```
node list-ports.js              # find the ATEN port (COM6 = Bluetooth, skip)
node bridge.js COM4 9600        # then send the captured bytes from /piu-diagnostics
```

> Note: passive listening on COM1 (`node sweep.js proveit`) will stay **silent** in PIU
> mode — the device only answers a command. That's expected, not a port problem.

---

## P572 register cheat sheet (RTU mode, Modbus)

Scaled-Int32 map (human-readable) and a legacy Float32 map. `modbus.js` reads the Float32
block for direct values. Slave address = SW1 position (1, or 1 when SW1=C).

| Reg | What | Notes |
|---|---|---|
| 1000 / 2038 | Good/A frequency (Hz) | flow-meter pulse freq |
| 1010–1020 | AnIn1–6 | mA (4-20mA) → PROVEit scales to Tm/Pm/Tp/Pp |
| 2008 | System Status | bits 0-7 |
| 2010 | Digital Inputs | bit 8 = DI9 = Detector Switch |
| 2012 | Prover Status | 0=idle … 7=done, 8=abort |
| 2018 / 2022 | Good/Bad pulse count | |
| 2072 | Digital Outputs (R/W) | DO1=Launch, DO5=Return |
| 2078 | Prover Configuration (R/W) | write 1 = initiate a prove |

Full map + worked examples: `p572-docs/extract_MBMAP.txt` and
`p572-docs/P572_Modbus_Address_Map.pdf`.

---

## Command cheat sheet

```
node modbus.js selftest             # offline frame/CRC check
node modbus.js tcp <rmu-ip>         # Modbus over Ethernet (Path A) ★
node modbus.js tcp <ip> <addr>      # if slave address isn't 1
node modbus.js rtu COM5 19200 1     # Modbus over RS485/RS422 (needs that adapter)

node list-ports.js                  # PIU path: find the ATEN COM port
node bridge.js COM4 9600            # PIU path: live RS232 bridge for /piu-diagnostics
node sweep.js capture COM4          # raw RS232 capture to a file
```
All captures/logs land in `serial-bridge/captures/`. Manuals in `serial-bridge/p572-docs/`.
