export function repeatabilityPct(meterFactors: number[]): number {
  if (meterFactors.length < 2) return 0;
  const min = Math.min(...meterFactors);
  const max = Math.max(...meterFactors);
  return ((max - min) / min) * 100;
}
