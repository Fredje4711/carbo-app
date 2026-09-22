export const CREDIT_KEY = "carbo_credits";
// This is a feedback incentive, not authentication or protection of API costs.
// Keep the previously distributed code usable for existing participants.
export const FEEDBACK_CODE = "1955";
export function parseCredits(value) {
  if (value === "unlimited") return Infinity;
  if (value === null || value === undefined || !/^\d+$/.test(value)) return 50;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 50;
}
export function creditValue(value) { return value === Infinity ? "unlimited" : String(Math.max(0, Math.trunc(value))); }
