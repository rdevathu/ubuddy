import type { LabValue } from '../types';

interface RefRange {
  /** Canonical lab name, lowercase. */
  name: string;
  /** Display name for the UI. */
  display: string;
  /** Match patterns (lowercased, anchored externally). */
  aliases: string[];
  /** Inclusive low bound. */
  low: number;
  /** Inclusive high bound. */
  high: number;
  unit?: string;
  /** Human-readable official range, shown verbatim in the Objective Data UI. */
  reference: string;
}

/**
 * Reference ranges transcribed EXACTLY from the official USMLE/UWorld lab
 * value sheet (the 8 reference screenshots). These are the only labs we flag;
 * everything else the student reads off the screen directly.
 *
 * Where a lab's official range varies by sex, we encode the UNION (broadest
 * acceptable adult range) for the high/low test and keep the per-sex split in
 * the `reference` string. A false negative (not flagging a value that's
 * abnormal for one sex) is preferable to a false positive here because we
 * don't know the patient's sex from a bare "Hgb 14" token and the student can
 * always glance at the question.
 *
 * Vitals (BP/pulse/respirations/temperature/SpO2) are NOT on the official lab
 * sheet but are kept as objective data with standard physiologic cutoffs —
 * temperature is always normalized to Fahrenheit (see extractLabs).
 */
const REF_RANGES: RefRange[] = [
  // ── Electrolytes, serum ────────────────────────────────────────────────
  { name: 'na', display: 'Sodium', aliases: ['na', 'sodium'], low: 136, high: 146, unit: 'mEq/L', reference: '136-146 mEq/L' },
  { name: 'k', display: 'Potassium', aliases: ['k', 'potassium'], low: 3.5, high: 5.0, unit: 'mEq/L', reference: '3.5-5.0 mEq/L' },
  { name: 'cl', display: 'Chloride', aliases: ['cl', 'chloride'], low: 95, high: 105, unit: 'mEq/L', reference: '95-105 mEq/L' },
  { name: 'hco3', display: 'Bicarbonate', aliases: ['hco3', 'bicarb', 'bicarbonate', 'co2'], low: 22, high: 28, unit: 'mEq/L', reference: '22-28 mEq/L' },
  { name: 'mg', display: 'Magnesium', aliases: ['mg', 'magnesium'], low: 1.5, high: 2.0, unit: 'mEq/L', reference: '1.5-2.0 mEq/L' },
  // ── Serum chemistry ────────────────────────────────────────────────────
  { name: 'ca', display: 'Calcium', aliases: ['ca', 'calcium'], low: 8.4, high: 10.2, unit: 'mg/dL', reference: '8.4-10.2 mg/dL' },
  { name: 'phos', display: 'Phosphorus', aliases: ['phos', 'phosphorus', 'phosphate'], low: 3.0, high: 4.5, unit: 'mg/dL', reference: '3.0-4.5 mg/dL' },
  { name: 'bun', display: 'BUN', aliases: ['bun', 'urea nitrogen'], low: 7, high: 18, unit: 'mg/dL', reference: '7-18 mg/dL' },
  { name: 'cr', display: 'Creatinine', aliases: ['cr', 'creatinine'], low: 0.6, high: 1.2, unit: 'mg/dL', reference: '0.6-1.2 mg/dL' },
  // Glucose: union of fasting (70-110) and random (<140) so a normal random
  // glucose isn't false-flagged as high; per-context split kept in reference.
  { name: 'glucose', display: 'Glucose', aliases: ['glucose', 'glu'], low: 70, high: 140, unit: 'mg/dL', reference: 'fasting 70-110, random <140 mg/dL' },
  { name: 'uric', display: 'Uric acid', aliases: ['uric acid', 'uric'], low: 3.0, high: 8.2, unit: 'mg/dL', reference: '3.0-8.2 mg/dL' },
  { name: 'tp', display: 'Total protein', aliases: ['total protein', 'tp'], low: 6.0, high: 7.8, unit: 'g/dL', reference: '6.0-7.8 g/dL' },
  { name: 'alb', display: 'Albumin', aliases: ['alb', 'albumin'], low: 3.5, high: 5.5, unit: 'g/dL', reference: '3.5-5.5 g/dL' },
  { name: 'tbili', display: 'Total bilirubin', aliases: ['total bilirubin', 'tbili', 'bilirubin'], low: 0.1, high: 1.0, unit: 'mg/dL', reference: '0.1-1.0 mg/dL' },
  { name: 'dbili', display: 'Direct bilirubin', aliases: ['direct bilirubin', 'dbili'], low: 0.0, high: 0.3, unit: 'mg/dL', reference: '0.0-0.3 mg/dL' },
  { name: 'alt', display: 'ALT', aliases: ['alt', 'sgpt'], low: 10, high: 40, unit: 'U/L', reference: '10-40 U/L' },
  { name: 'ast', display: 'AST', aliases: ['ast', 'sgot'], low: 12, high: 38, unit: 'U/L', reference: '12-38 U/L' },
  { name: 'alp', display: 'Alkaline phosphatase', aliases: ['alp', 'alk phos', 'alkaline phosphatase'], low: 25, high: 100, unit: 'U/L', reference: '25-100 U/L' },
  { name: 'amylase', display: 'Amylase', aliases: ['amylase'], low: 25, high: 125, unit: 'U/L', reference: '25-125 U/L' },
  { name: 'ldh', display: 'LDH', aliases: ['ldh', 'lactate dehydrogenase'], low: 45, high: 200, unit: 'U/L', reference: '45-200 U/L' },
  { name: 'ck', display: 'Creatine kinase', aliases: ['creatine kinase', 'ck', 'cpk'], low: 10, high: 90, unit: 'U/L', reference: 'M 25-90, F 10-70 U/L' },
  { name: 'osm', display: 'Osmolality', aliases: ['osmolality', 'osm', 'serum osmolality'], low: 275, high: 295, unit: 'mOsmol/kg', reference: '275-295 mOsmol/kg' },
  // Lipids — only the abnormal direction is meaningful, so low bounds are
  // open (HDL is the exception: low HDL is the pathologic finding).
  { name: 'chol', display: 'Total cholesterol', aliases: ['total cholesterol', 'cholesterol'], low: -Infinity, high: 240, unit: 'mg/dL', reference: 'normal <200, high >240 mg/dL' },
  { name: 'ldl', display: 'LDL', aliases: ['ldl'], low: -Infinity, high: 160, unit: 'mg/dL', reference: '<160 mg/dL' },
  { name: 'hdl', display: 'HDL', aliases: ['hdl'], low: 40, high: 60, unit: 'mg/dL', reference: '40-60 mg/dL' },
  { name: 'tg', display: 'Triglycerides', aliases: ['triglycerides', 'tg', 'trigs'], low: -Infinity, high: 150, unit: 'mg/dL', reference: 'normal <150, borderline 151-199 mg/dL' },
  // ── Endocrine / iron studies ───────────────────────────────────────────
  { name: 'tsh', display: 'TSH', aliases: ['tsh'], low: 0.4, high: 4.0, unit: 'µU/mL', reference: '0.4-4.0 µU/mL' },
  { name: 'ft4', display: 'Free T4', aliases: ['free t4', 'ft4'], low: 0.9, high: 1.7, unit: 'ng/dL', reference: '0.9-1.7 ng/dL' },
  { name: 't4', display: 'Thyroxine (T4)', aliases: ['thyroxine', 't4'], low: 5, high: 12, unit: 'µg/dL', reference: '5-12 µg/dL' },
  { name: 't3', display: 'Triiodothyronine (T3)', aliases: ['triiodothyronine', 't3'], low: 100, high: 200, unit: 'ng/dL', reference: '100-200 ng/dL' },
  { name: 'pth', display: 'PTH', aliases: ['pth', 'parathyroid hormone'], low: 10, high: 60, unit: 'pg/mL', reference: '10-60 pg/mL' },
  { name: 'prolactin', display: 'Prolactin', aliases: ['prolactin', 'prl'], low: -Infinity, high: 25, unit: 'ng/mL', reference: 'M <17, F <25 ng/mL' },
  { name: 'ferritin', display: 'Ferritin', aliases: ['ferritin'], low: 10, high: 250, unit: 'ng/mL', reference: 'M 20-250, F 10-120 ng/mL' },
  { name: 'iron', display: 'Iron', aliases: ['iron', 'serum iron'], low: 50, high: 175, unit: 'µg/dL', reference: 'M 65-175, F 50-170 µg/dL' },
  { name: 'tibc', display: 'TIBC', aliases: ['tibc', 'total iron-binding capacity', 'total iron binding capacity'], low: 250, high: 400, unit: 'µg/dL', reference: '250-400 µg/dL' },
  { name: 'transferrin', display: 'Transferrin', aliases: ['transferrin'], low: 200, high: 360, unit: 'mg/dL', reference: '200-360 mg/dL' },
  // ── Hematologic ────────────────────────────────────────────────────────
  { name: 'wbc', display: 'Leukocytes', aliases: ['wbc', 'leukocyte', 'leukocytes', 'leukocyte count'], low: 4500, high: 11000, unit: '/mm³', reference: '4500-11,000/mm³' },
  { name: 'hgb', display: 'Hemoglobin', aliases: ['hgb', 'hb', 'hemoglobin'], low: 12.0, high: 17.5, unit: 'g/dL', reference: 'M 13.5-17.5, F 12.0-16.0 g/dL' },
  { name: 'hct', display: 'Hematocrit', aliases: ['hct', 'hematocrit'], low: 36, high: 53, unit: '%', reference: 'M 41-53%, F 36-46%' },
  { name: 'plt', display: 'Platelets', aliases: ['plt', 'platelet', 'platelets', 'platelet count'], low: 150000, high: 400000, unit: '/mm³', reference: '150,000-400,000/mm³' },
  { name: 'rbc', display: 'Erythrocytes', aliases: ['rbc', 'erythrocyte count', 'erythrocytes'], low: 3.5, high: 5.9, unit: 'million/mm³', reference: 'M 4.3-5.9, F 3.5-5.5 million/mm³' },
  { name: 'mcv', display: 'MCV', aliases: ['mcv'], low: 80, high: 100, unit: 'µm³', reference: '80-100 µm³' },
  { name: 'mch', display: 'MCH', aliases: ['mch'], low: 25, high: 35, unit: 'pg/cell', reference: '25-35 pg/cell' },
  { name: 'mchc', display: 'MCHC', aliases: ['mchc'], low: 31, high: 36, unit: '% Hb/cell', reference: '31-36% Hb/cell' },
  { name: 'retic', display: 'Reticulocytes', aliases: ['reticulocyte', 'reticulocytes', 'retic', 'reticulocyte count'], low: 0.5, high: 1.5, unit: '%', reference: '0.5-1.5%' },
  { name: 'esr', display: 'ESR', aliases: ['esr', 'sedimentation rate'], low: 0, high: 20, unit: 'mm/h', reference: 'M 0-15, F 0-20 mm/h' },
  { name: 'ddimer', display: 'D-dimer', aliases: ['d-dimer', 'ddimer'], low: 0, high: 250, unit: 'ng/mL', reference: '≤250 ng/mL' },
  { name: 'hba1c', display: 'Hemoglobin A1c', aliases: ['hba1c', 'a1c', 'hemoglobin a1c'], low: -Infinity, high: 6, unit: '%', reference: '≤6%' },
  { name: 'eos', display: 'Eosinophils', aliases: ['eosinophil', 'eosinophils'], low: 1, high: 3, unit: '%', reference: '1-3%' },
  { name: 'lymph', display: 'Lymphocytes', aliases: ['lymphocyte', 'lymphocytes'], low: 25, high: 33, unit: '%', reference: '25-33%' },
  { name: 'neut', display: 'Neutrophils', aliases: ['neutrophil', 'neutrophils', 'segmented neutrophils'], low: 54, high: 62, unit: '%', reference: 'segmented 54-62%' },
  { name: 'mono', display: 'Monocytes', aliases: ['monocyte', 'monocytes'], low: 3, high: 7, unit: '%', reference: '3-7%' },
  { name: 'baso', display: 'Basophils', aliases: ['basophil', 'basophils'], low: 0, high: 0.75, unit: '%', reference: '0-0.75%' },
  // ── Coagulation ────────────────────────────────────────────────────────
  { name: 'pt', display: 'PT', aliases: ['pt', 'prothrombin time'], low: 11, high: 15, unit: 'sec', reference: '11-15 seconds' },
  { name: 'ptt', display: 'PTT', aliases: ['ptt', 'aptt', 'partial thromboplastin time'], low: 25, high: 40, unit: 'sec', reference: '25-40 seconds' },
  // ── Arterial blood gas (room air) ──────────────────────────────────────
  { name: 'ph', display: 'pH', aliases: ['ph', 'arterial ph'], low: 7.35, high: 7.45, reference: '7.35-7.45' },
  { name: 'pco2', display: 'PCO₂', aliases: ['pco2', 'paco2'], low: 33, high: 45, unit: 'mm Hg', reference: '33-45 mm Hg' },
  { name: 'po2', display: 'PO₂', aliases: ['po2', 'pao2'], low: 75, high: 105, unit: 'mm Hg', reference: '75-105 mm Hg' },
  // ── Cardiac ────────────────────────────────────────────────────────────
  { name: 'troponin', display: 'Troponin I', aliases: ['troponin', 'troponin i', 'tni'], low: -Infinity, high: 0.04, unit: 'ng/mL', reference: '<0.04 ng/mL' },
  // ── CSF (multi-word aliases keep these distinct from serum) ─────────────
  { name: 'csf_glu', display: 'CSF glucose', aliases: ['csf glucose'], low: 40, high: 70, unit: 'mg/dL', reference: '40-70 mg/dL' },
  { name: 'csf_pro', display: 'CSF protein', aliases: ['csf protein', 'csf proteins'], low: -Infinity, high: 40, unit: 'mg/dL', reference: '<40 mg/dL' },
  { name: 'csf_cell', display: 'CSF cell count', aliases: ['csf cell count'], low: 0, high: 5, unit: '/mm³', reference: '0-5/mm³' },
  { name: 'csf_pres', display: 'CSF pressure', aliases: ['csf pressure', 'opening pressure'], low: 70, high: 180, unit: 'mm H₂O', reference: '70-180 mm H₂O' },
  // ── Renal ──────────────────────────────────────────────────────────────
  { name: 'crcl', display: 'Creatinine clearance', aliases: ['creatinine clearance', 'crcl'], low: 88, high: 137, unit: 'mL/min', reference: 'M 97-137, F 88-128 mL/min' },
  // ── Vitals (not on the official lab sheet; standard physiologic cutoffs) ─
  { name: 'pulse', display: 'Pulse', aliases: ['pulse', 'heart rate', 'hr'], low: 60, high: 100, unit: '/min', reference: '60-100/min' },
  { name: 'rr', display: 'Respirations', aliases: ['respirations', 'rr', 'respiratory rate'], low: 12, high: 20, unit: '/min', reference: '12-20/min' },
  { name: 'temp_f', display: 'Temperature', aliases: ['temperature', 'temp'], low: 97.0, high: 99.5, unit: '°F', reference: '97.0-99.5 °F' },
  { name: 'spo2', display: 'SpO₂', aliases: ['spo2', 'o2 sat', 'oxygen saturation'], low: 95, high: 100, unit: '%', reference: '95-100%' },
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
    labs.push({
      name: 'BP',
      value: `${sys}/${dia}`,
      unit: 'mm Hg',
      reference: '90/60-140/90 mm Hg',
      status,
    });
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
      reference: range.reference,
      status: classify(value, range),
    });
  }
  return labs;
}

function matchAliasFuzzy(token: string): RefRange | null {
  // Allow multi-word aliases ("free t4", "csf glucose") by checking suffix.
  // Longest alias first so "csf glucose" wins over a bare "glucose".
  let best: RefRange | null = null;
  let bestLen = 0;
  for (const [alias, range] of ALIAS_INDEX) {
    if (alias.includes(' ') && token.endsWith(alias) && alias.length > bestLen) {
      best = range;
      bestLen = alias.length;
    }
  }
  return best;
}

export function abnormalLabs(labs: LabValue[]): LabValue[] {
  return labs.filter((l) => l.status === 'low' || l.status === 'high');
}

/**
 * Compact, unit-free rendering for the LLM intense summary: no units (mm Hg,
 * °C/°F, /min, mg/dL, etc.) — they bloat the summary and slow the reader down.
 * BP "80/50" → "80 over 50".
 */
export function labValueNoUnits(l: LabValue): string {
  const v = l.value.includes('/') ? l.value.replace('/', ' over ') : l.value;
  return `${l.name} ${v}, ${l.status}`;
}

export function summarizeLabsForLLM(labs: LabValue[]): string {
  const abnormal = abnormalLabs(labs);
  if (abnormal.length === 0) return 'no abnormal vitals or labs';
  return abnormal.map(labValueNoUnits).join('; ');
}
