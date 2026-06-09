// Shared shapes for the manual can-proving entry page + certificate.

/**
 * Tolerant decimal parser for hand-entered field values. Accepts a decimal comma
 * ("60,9" → 60.9) and thousands separators ("1,000.5" → 1000.5), trims whitespace,
 * and returns NaN for blank/invalid so callers can treat it as "not entered yet".
 */
export function parseDecimal(s: string): number {
  const t = s.trim();
  if (t === "") return NaN;
  // Both separators present → comma is thousands, strip it. Only comma → it's the decimal.
  const norm = t.includes(",") && t.includes(".") ? t.replace(/,/g, "") : t.replace(/,/g, ".");
  return parseFloat(norm);
}

export interface CanHeader {
  certNo: string;
  testDate: string;
  lastTestDate: string;
  customer: string; // company name (display)
  customerId: string; // roster id, "" if free / unsaved
  location: string; // site / terminal name (display)
  locationId: string;
  address: string;
  product: string;
  gravity: string; // °API
  throughputSince: string;
  meterMake: string;
  meterModel: string;
  meterSize: string;
  meterId: string;
  meterSeal: string;
  previousMeterFactor: string; // the meter's currently-loaded factor (O); new factor is derived from it
  lastTotalizer: string;
  startTotalizer: string;
  finishTotalizer: string;
  proverId: string;
  proverSerial: string;
  proverSize: string;
  comments: string;
  performedBy: string;
  witness: string;
}

export interface CanRunRow {
  tankReading: string; // A
  t1: string; // B top
  t2: string; // B mid
  t3: string; // B bot
  metered: string; // G
  invoiceTemp: string; // H
  flowGpm: string; // flow rate during the run (recorded, not in the calc)
  wetDown: boolean; // excluded from repeatability
}

export function emptyHeader(): CanHeader {
  return {
    certNo: "",
    testDate: "",
    lastTestDate: "",
    customer: "",
    customerId: "",
    location: "",
    locationId: "",
    address: "",
    product: "",
    gravity: "",
    throughputSince: "",
    meterMake: "",
    meterModel: "",
    meterSize: "",
    meterId: "",
    meterSeal: "",
    previousMeterFactor: "",
    lastTotalizer: "",
    startTotalizer: "",
    finishTotalizer: "",
    proverId: "",
    proverSerial: "",
    proverSize: "",
    comments: "",
    performedBy: "",
    witness: "",
  };
}

export function emptyRow(): CanRunRow {
  return { tankReading: "", t1: "", t2: "", t3: "", metered: "", invoiceTemp: "", flowGpm: "", wetDown: false };
}
