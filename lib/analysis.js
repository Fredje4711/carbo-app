// Shared validation: never present unchecked model output as a meal result.
const LEVELS = ["laag", "middel", "hoog"];
const FIELDS = ["carbs_min_g", "carbs_best_g", "carbs_max_g"];
function text(value, max) {
  if (typeof value !== "string" || value.length > max || !value.trim()) throw new Error("Het resultaat bevat ongeldige tekst.");
  return value.trim();
}
function range(value, maximum) {
  if (!value || !LEVELS.includes(value.confidence) || FIELDS.some(key => typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0 || value[key] > maximum)) throw new Error("Het resultaat bevat ongeldige hoeveelheden.");
  if (value.carbs_min_g > value.carbs_best_g || value.carbs_best_g > value.carbs_max_g) throw new Error("De schattingen spreken elkaar tegen.");
  return Object.fromEntries([...FIELDS.map(key => [key, value[key]]), ["confidence", value.confidence]]);
}
export function normalizeAnalysis(value) {
  if (!value || typeof value.meal_detected !== "boolean" || !Array.isArray(value.items) || value.items.length > 12 || !Array.isArray(value.assumptions) || value.assumptions.length > 8) throw new Error("De analyseservice gaf geen volledig resultaat.");
  const summary = text(value.summary, 400);
  const assumptions = value.assumptions.map(item => text(item, 200));
  const total = range(value.total, 1500);
  if (!value.meal_detected) {
    if (value.items.length || FIELDS.some(key => total[key] !== 0)) throw new Error("Het resultaat bevat tegenstrijdige maaltijdgegevens.");
    return { meal_detected: false, items: [], total: { ...total, confidence: "laag" }, summary, assumptions };
  }
  if (!value.items.length) throw new Error("Er zijn geen maaltijdonderdelen herkend.");
  const items = value.items.map(item => ({ name: text(item.name, 100), portion: text(item.portion, 120), ...range(item, 500), reasoning: text(item.reasoning, 240) }));
  // Derive the total from the parts rather than trusting an independent AI sum.
  for (const key of FIELDS) {
    total[key] = Math.round(items.reduce((sum, item) => sum + item[key], 0) * 10) / 10;
    if (total[key] > 1500) throw new Error("De totale hoeveelheid is niet plausibel.");
  }
  total.confidence = LEVELS[Math.min(LEVELS.indexOf(total.confidence), ...items.map(item => LEVELS.indexOf(item.confidence)))];
  return { meal_detected: true, items, total, summary, assumptions };
}
export function formatGrams(value) { return new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 }).format(value); }
