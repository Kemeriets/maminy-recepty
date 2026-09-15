export function isOptionalRecipeNumber(value: string, positive = false): boolean {
  if (!value.trim()) return true;
  // Reject Infinity, negatives, exponent notation and accidental non-decimal input.
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return false;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) && (positive ? number > 0 : number >= 0);
}
