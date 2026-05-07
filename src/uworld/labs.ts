import type { LabValue } from '../types';

interface RefRange {
  /** Canonical lab name, lowercase. */
  name: string;
  /** Display name for UI/TTS. */
  display: string;
  /** Match patterns (lowercased, anchored externally). */
  aliases: string[];
  /** Inclusive low bound. */
  low: number;
  /** Inclusive high bound. */
  high: number;
  unit?: string;
}

/**
 * Reference ranges (adult, common UWorld values). Used only when UWorld omits
 * the in-stem reference range. Where labs vary by sex/age we use the broadest
 * acceptable adult range — false negatives are preferable to false positives
 * here because the user can always glance at the question.
 */
const REF_RANGES: RefRange[] = [
  // CBC
  { name: 'wbc', display: 'WBC', aliases: ['wbc'], low: 4.5, high: 11, unit: 'x10^9/L' },
  { name: 'hgb', display: 'Hgb', aliases: ['hgb', 'hemoglobin'], low: 12, high: 17, unit: 'g/dL' },
  { name: 'hct', display: 'Hct', aliases: ['hct', 'hematocrit'], low: 36, high: 51, unit: '%' },
  { name: 'plt', display: 'Platelets', aliases: ['plt', 'platelet', 'platelets'], low: 150, high: 400, unit: 'x10^9/L' },
  { name: 'mcv', display: 'MCV', aliases: ['mcv'], low: 80, high: 100, unit: 'fL' },
  // BMP / CMP
  { name: 'na', display: 'Sodium', aliases: ['na', 'sodium'], low: 135, high: 145, unit: 'mEq/L' },
  { name: 'k', display: 'Potassium', aliases: ['k', 'potassium'], low: 3.5, high: 5, unit: 'mEq/L' },
  { name: 'cl', display: 'Chloride', aliases: ['cl', 'chloride'], low: 96, high: 106, unit: 'mEq/L' },
  { name: 'hco3', display: 'Bicarbonate', aliases: ['hco3', 'bicarb', 'bicarbonate', 'co2'], low: 22, high: 29, unit: 'mEq/L' },
  { name: 'bun', display: 'BUN', aliases: ['bun'], low: 7, high: 20, unit: 'mg/dL' },
  { name: 'cr', display: 'Creatinine', aliases: ['cr', 'creatinine'], low: 0.6, high: 1.3, unit: 'mg/dL' },
  { name: 'glucose', display: 'Glucose', aliases: ['glucose', 'glu'], low: 70, high: 110, unit: 'mg/dL' },
  { name: 'ca', display: 'Calcium', aliases: ['ca', 'calcium'], low: 8.5, high: 10.5, unit: 'mg/dL' },
  { name: 'mg', display: 'Magnesium', aliases: ['mg', 'magnesium'], low: 1.5, high: 2.5, unit: 'mg/dL' },
  { name: 'phos', display: 'Phosphate', aliases: ['phos', 'phosphate'], low: 2.5, high: 4.5, unit: 'mg/dL' },
  { name: 'alb', display: 'Albumin', aliases: ['alb', 'albumin'], low: 3.5, high: 5, unit: 'g/dL' },
  { name: 'tp', display: 'Total protein', aliases: ['total protein', 'tp'], low: 6, high: 8, unit: 'g/dL' },
  { name: 'tbili', display: 'Total bilirubin', aliases: ['total bilirubin', 'tbili', 'bilirubin'], low: 0.1, high: 1.2, unit: 'mg/dL' },
  { name: 'alt', display: 'ALT', aliases: ['alt', 'sgpt'], low: 7, high: 56, unit: 'U/L' },
  { name: 'ast', display: 'AST', aliases: ['ast', 'sgot'], low: 10, high: 40, unit: 'U/L' },
  { name: 'alp', display: 'Alkaline phosphatase', aliases: ['alp', 'alk phos', 'alkaline phosphatase'], low: 40, high: 130, unit: 'U/L' },
  // Coags
  { name: 'inr', display: 'INR', aliases: ['inr'], low: 0.8, high: 1.2 },
  { name: 'pt', display: 'PT', aliases: ['pt'], low: 11, high: 15, unit: 'sec' },
  { name: 'ptt', display: 'PTT', aliases: ['ptt', 'aptt'], low: 25, high: 40, unit: 'sec' },
  { name: 'ddimer', display: 'D-dimer', aliases: ['d-dimer', 'ddimer'], low: 0, high: 0.5, unit: 'mg/L' },
  // Inflammation
  { name: 'crp', display: 'CRP', aliases: ['crp'], low: 0, high: 3, unit: 'mg/L' },
  { name: 'esr', display: 'ESR', aliases: ['esr'], low: 0, high: 20, unit: 'mm/hr' },
  // Lipids / endo
  { name: 'tsh', display: 'TSH', aliases: ['tsh'], low: 0.4, high: 4, unit: 'mIU/L' },
  { name: 't4', display: 'Free T4', aliases: ['free t4', 'ft4'], low: 0.8, high: 1.8, unit: 'ng/dL' },
  { name: 'hba1c', display: 'HbA1c', aliases: ['hba1c', 'a1c'], low: 4, high: 5.6, unit: '%' },
  { name: 'troponin', display: 'Troponin', aliases: ['troponin', 'tnt', 'troponin i'], low: 0, high: 0.04, unit: 'ng/mL' },
  { name: 'bnp', display: 'BNP', aliases: ['bnp'], low: 0, high: 100, unit: 'pg/mL' },
  { name: 'lactate', display: 'Lactate', aliases: ['lactate', 'lactic acid'], low: 0.5, high: 2.2, unit: 'mmol/L' },
  // Vitals
  { name: 'pulse', display: 'Pulse', aliases: ['pulse', 'heart rate', 'hr'], low: 60, high: 100, unit: '/min' },
  { name: 'rr', display: 'Respirations', aliases: ['respirations', 'rr', 'respiratory rate'], low: 12, high: 20, unit: '/min' },
  { name: 'temp_f', display: 'Temperature', aliases: ['temperature', 'temp'], low: 97, high: 99.5, unit: '°F' },
  { name: 'spo2', display: 'SpO2', aliases: ['spo2', 'o2 sat', 'oxygen saturation'], low: 95, high: 100, unit: '%' },
];

const ALIAS_INDEX = new Map<string, RefRange>();
for (const r of REF_RANGES) {
  for (const a of r.aliases) ALIAS_INDEX.set(a.toLowerCase(), r);
}

/**
 * Lab tokens look like:
 *   "Na 142", "K 3.4 mEq/L", "Hgb 8.2", "BP 80/50", "platelets 250,000",
 *   "Creatinine 1.8 mg/dL", "TSH 0.2"
 * BP is special-cased.
 */
const LAB_REGEX = /\b([A-Za-z][A-Za-z\s\-]{1,30}?)\s*(?:is|=|:)?\s*(\d+(?:[.,]\d+)?)\s*(\/\s*\d+(?:[.,]\d+)?)?\s*([a-zA-Z%°/^0-9\-µ]+)?/g;
const BP_REGEX = /\b(?:blood pressure|bp)\s*(?:is|=|:)?\s*(\d{2,3})\s*\/\s*(\d{2,3})/gi;

function classify(value: number, range: RefRange): LabValue['status'] {
  if (Number.isNaN(value)) return 'unknown';
  if (value < range.low) return 'low';
  if (value > range.high) return 'high';
  return 'normal';
}

function celsiusToFahrenheit(c: number): number {
  return Math.round(((c * 9) / 5 + 32) * 10) / 10;
}

/** Return true if the unit string indicates Celsius. */
function isCelsius(unit?: string): boolean {
  if (!unit) return false;
  const u = unit.trim();
  return /(^|[^a-z])C$/i.test(u) || u.includes('°C') || u.toLowerCase() === 'c';
}

export function extractLabs(text: string): LabValue[] {
  if (!text) return [];
  const labs: LabValue[] = [];
  const seen = new Set<string>();

  // Special: BP uses systolic/diastolic, not a single bound.
  let bpMatch: RegExpExecArray | null;
  while ((bpMatch = BP_REGEX.exec(text))) {
    const sys = parseInt(bpMatch[1], 10);
    const dia = parseInt(bpMatch[2], 10);
    if (Number.isNaN(sys) || Number.isNaN(dia)) continue;
    const status: LabValue['status'] =
      sys < 90 || dia < 60 ? 'low' : sys > 140 || dia > 90 ? 'high' : 'normal';
    const key = `bp-${sys}-${dia}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labs.push({ name: 'BP', value: `${sys}/${dia}`, unit: 'mm Hg', status });
  }

  let m: RegExpExecArray | null;
  while ((m = LAB_REGEX.exec(text))) {
    const rawName = m[1].trim().toLowerCase();
    const valueStr = m[2].replace(',', '');
    const slashSegment = m[3]; // skip if pair like 80/50 — handled by BP
    if (slashSegment) continue;
    const range = ALIAS_INDEX.get(rawName) ?? matchAliasFuzzy(rawName);
    if (!range) continue;
    let value = parseFloat(valueStr);
    if (Number.isNaN(value)) continue;
    let unit = m[4]?.trim() || range.unit;

    // Temperature normalization: always store/display in Fahrenheit.
    if (range.name === 'temp_f' && (isCelsius(unit) || (value < 50 && !unit))) {
      value = celsiusToFahrenheit(value);
      unit = '°F';
    }

    const displayValue = Number.isInteger(value) ? value.toString() : value.toFixed(1);
    const key = `${range.name}-${displayValue}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labs.push({
      name: range.display,
      value: displayValue,
      unit,
      status: classify(value, range),
    });
  }
  return labs;
}

function matchAliasFuzzy(token: string): RefRange | null {
  // Allow "free t4" style 2-word aliases by checking suffix tokens.
  for (const [alias, range] of ALIAS_INDEX) {
    if (alias.includes(' ') && token.endsWith(alias)) return range;
  }
  return null;
}

export function abnormalLabs(labs: LabValue[]): LabValue[] {
  return labs.filter((l) => l.status === 'low' || l.status === 'high');
}

/**
 * TTS-friendly rendering: no units (mm Hg, °C/°F, /min, mg/dL, etc.) because
 * they trip up TTS voices and slow the user down. BP "80/50" → "80 over 50".
 */
export function ttsLabValue(l: LabValue): string {
  const v = l.value.includes('/') ? l.value.replace('/', ' over ') : l.value;
  return `${l.name} ${v}, ${l.status}`;
}

export function summarizeLabsForLLM(labs: LabValue[]): string {
  const abnormal = abnormalLabs(labs);
  if (abnormal.length === 0) return 'no abnormal vitals or labs';
  return abnormal.map(ttsLabValue).join('; ');
}
