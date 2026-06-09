import { describe, expect, test } from "vitest";
import {
  BLOCKS,
  buildRtuFrame,
  decodeFloat32,
  decodeReading,
  modbusCrc16,
  registersFromBytes,
  scaleMa,
  toLiveSample,
} from "./p572";

describe("P572 Modbus framing", () => {
  test("RTU frame matches the manual's worked example (FC03 reg2038 ×2, unit 1)", () => {
    expect(Array.from(buildRtuFrame(1, 2038, 2))).toEqual([
      0x01, 0x03, 0x07, 0xf6, 0x00, 0x02, 0x25, 0x4d,
    ]);
  });

  test("CRC16 of FC03 reg0 ×2 = 0x0BC4", () => {
    expect(modbusCrc16(new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x00, 0x02]))).toBe(0x0bc4);
  });

  test("registersFromBytes is big-endian", () => {
    expect(registersFromBytes(new Uint8Array([0x45, 0x79, 0xfe, 0xd6]))).toEqual([0x4579, 0xfed6]);
  });
});

describe("P572 decoding", () => {
  test("Float32 decode: 45 79 FE D6 = 3999.927 Hz (manual example)", () => {
    expect(decodeFloat32(0x4579, 0xfed6)).toBeCloseTo(3999.927, 2);
  });

  test("decodeReading maps the float + scaled blocks", () => {
    const floats = new Array(BLOCKS.floats.qty).fill(0);
    floats[0] = 0x4579; // Freq A @1000
    floats[1] = 0xfed6;
    floats[10] = 0x4140; // AnIn1 @1010 = 12.0 (0x41400000)
    floats[11] = 0x0000;

    const scaled = new Array(BLOCKS.scaled.qty).fill(0);
    scaled[2] = 0x0000; // Digital Inputs @2010 …
    scaled[3] = 0x0100; // … bit 8 set → detector closed
    scaled[4] = 0x0000; // Prover Status @2012 …
    scaled[5] = 0x0007; // … = 7 (Done)
    scaled[5 + 17] = 0; // (within bounds sanity)

    const r = decodeReading({ floats, scaled });
    expect(r.freqA).toBeCloseTo(3999.927, 2);
    expect(r.anInMa[0]).toBeCloseTo(12.0, 3);
    expect(r.detectorClosed).toBe(true);
    expect(r.proverStatus).toBe(7);
    expect(r.proverStateText).toBe("Done");
  });
});

describe("4-20mA scaling", () => {
  test("midscale", () => {
    expect(scaleMa(12, { anIn: 1, maMin: 4, maMax: 20, engMin: 0, engMax: 100 })).toBeCloseTo(50);
  });
  test("endpoints", () => {
    const s = { anIn: 1, maMin: 4, maMax: 20, engMin: -40, engMax: 160 };
    expect(scaleMa(4, s)).toBeCloseTo(-40);
    expect(scaleMa(20, s)).toBeCloseTo(160);
  });
  test("toLiveSample applies the channel map", () => {
    const reading = {
      freqA: 60, freqB: 0, freqC: 0, density1Us: 0, density2Us: 0,
      anInMa: [12, 4, 12, 4, 0, 0],
      systemStatus: 0, digitalInputs: 0, detectorClosed: false,
      proverStatus: 0, proverStateText: "", messageId: 0,
      goodPulseCount: 0, proverPulseSw1Sw2: 1234,
    };
    const sample = toLiveSample(reading, {
      meterTempF: { anIn: 1, maMin: 4, maMax: 20, engMin: 0, engMax: 200 },
      meterPressurePsig: { anIn: 2, maMin: 4, maMax: 20, engMin: 0, engMax: 500 },
    });
    expect(sample.frequencyHz).toBe(60);
    expect(sample.pulses).toBe(1234);
    expect(sample.meterTempF).toBeCloseTo(100); // 12mA of 4-20 → 50% → 100
    expect(sample.meterPressurePsig).toBeCloseTo(0); // 4mA → 0%
    expect(sample.proverTempF).toBeUndefined(); // not mapped
  });
});
