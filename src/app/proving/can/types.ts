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
  productId: string; // selected product record, "" if free
  gravity: string; // °API
  throughputSince: string;
  meterRecordId: string; // selected meter record, "" if free
  meterMake: string;
  meterModel: string;
  meterSize: string;
  meterId: string; // the physical meter's ID # (also used as the saved meter's tag)
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
    productId: "",
    gravity: "",
    throughputSince: "",
    meterRecordId: "",
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

// ---- Saved provings (history) ----------------------------------------------
// A finished/in-progress can proving, kept so it can be reopened and re-printed.
export interface SavedCanProving {
  id: string;
  savedAt: string; // ISO timestamp
  header: CanHeader;
  rows: CanRunRow[];
}

const PROVINGS_KEY = "can-provings-v1";

export function loadSavedProvings(): SavedCanProving[] {
  try {
    const raw = localStorage.getItem(PROVINGS_KEY);
    const list = raw ? (JSON.parse(raw) as SavedCanProving[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function persistSavedProvings(list: SavedCanProving[]) {
  try {
    localStorage.setItem(PROVINGS_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}

export function newProvingId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `p-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
