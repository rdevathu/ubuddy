/**
 * Deterministic UWorld → StepBuddy system-tag mapping.
 *
 * The map lives in `src/stepbuddy/classify.ts:UWORLD_SYSTEM_MAP`. Two things
 * matter and break independently:
 *
 *   1. Every UWorld category name maps to a real `SystemTag` (otherwise
 *      `mapUworldSystem` falls back to `Miscellaneous (MISC)` silently and
 *      the student's question gets logged into the wrong bucket).
 *   2. Every value in the map is in `SYSTEM_TAGS` (otherwise the RPC will
 *      reject the push with "invalid system_tag: …").
 *
 * Also exercises a handful of input-noise cases (extra whitespace,
 * mixed case, missing value) — the parser sometimes hands us slightly
 * dirty strings.
 */

import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mapUworldSystem } from '../src/stepbuddy/classify';
import {
  DEFAULT_SYSTEM_TAG,
  SYSTEM_TAGS,
  type SystemTag,
} from '../src/stepbuddy/client';
import { FIXTURES, POST_FIXTURES } from './fixtureMetadata';
import { fixturePath, loadFixture } from './fixtures';
import { parseExplanation, parseQuestion } from '../src/uworld/parser';

// Every UWorld category UWorld currently exposes in the System column,
// paired with the StepBuddy tag we expect for each. Pinning the mapping
// here (as opposed to importing the map directly) lets the test catch
// silent edits to the table.
const EXPECTED_MAPPING: Record<string, SystemTag> = {
  'Allergy & Immunology': 'Allergy & Immunology',
  'Biostatistics & Epidemiology': 'Biostatistics & Epidemiology',
  'Cardiovascular System': 'Cardiovascular System (CV)',
  'Dermatology': 'Dermatology (DERM)',
  'Ear, Nose & Throat (ENT)': 'Ear, Nose & Throat (ENT)',
  'Endocrine, Diabetes & Metabolism': 'Endocrine (ENDO)',
  'Female Reproductive System & Breast': 'Gynecology (GYN)',
  'Gastrointestinal & Nutrition': 'Gastrointestinal (GI)',
  'General Principles': 'Miscellaneous (MISC)',
  'Hematology & Oncology': 'Hematology & Oncology (HEME-ONC)',
  'Infectious Diseases': 'Infectious Diseases (ID)',
  'Male Reproductive System': 'Male Reproductive System (URO)',
  'Miscellaneous (Multisystem)': 'Miscellaneous (MISC)',
  'Nervous System': 'Nervous System (NEURO)',
  'Ophthalmology': 'Ophthalmology (OPHTHO)',
  'Poisoning & Environmental Exposure': 'Poisoning & Environmental Exposure',
  'Pregnancy, Childbirth & Puerperium': 'Obstetrics (OB)',
  'Psychiatric/Behavioral & Substance Use Disorder': 'Psychiatric/Behavioral (PSYCH)',
  'Pulmonary & Critical Care': 'Pulmonary & Critical Care (PULM)',
  'Renal, Urinary Systems & Electrolytes': 'Nephrology (RENAL)',
  'Rheumatology/Orthopedics & Sports': 'MSK & Orthopedics',
  'Social Sciences (Ethics/Legal/Professional)': 'Social Sciences (Ethics/Legal/QI)',
};

describe('mapUworldSystem — every UWorld category', () => {
  for (const [uworld, expected] of Object.entries(EXPECTED_MAPPING)) {
    test(`"${uworld}" → "${expected}"`, () => {
      expect(mapUworldSystem(uworld)).toBe(expected);
    });
  }

  test('every mapped value is a real StepBuddy SystemTag (RPC won\'t 400)', () => {
    const allowed = new Set<string>(SYSTEM_TAGS);
    for (const tag of Object.values(EXPECTED_MAPPING)) {
      expect(allowed.has(tag)).toBe(true);
    }
  });
});

describe('mapUworldSystem — noise tolerance + fallback', () => {
  test('extra whitespace + mixed case still maps', () => {
    expect(mapUworldSystem('  cardiovascular  system  ')).toBe('Cardiovascular System (CV)');
    expect(mapUworldSystem('GASTROINTESTINAL & NUTRITION')).toBe('Gastrointestinal (GI)');
  });

  test('missing / unknown values fall back to Miscellaneous (MISC)', () => {
    expect(mapUworldSystem(undefined)).toBe(DEFAULT_SYSTEM_TAG);
    expect(mapUworldSystem(null)).toBe(DEFAULT_SYSTEM_TAG);
    expect(mapUworldSystem('')).toBe(DEFAULT_SYSTEM_TAG);
    expect(mapUworldSystem('Cardiology')).toBe(DEFAULT_SYSTEM_TAG); // UWorld doesn't use this
    expect(DEFAULT_SYSTEM_TAG).toBe('Miscellaneous (MISC)');
  });
});

// End-to-end fixture check: parse a real explanation, pipe its `system` field
// through the mapper, assert we got the StepBuddy tag we'd send to the RPC.
const HAS_FIXTURES = FIXTURES.every((f) => existsSync(fixturePath(f.file)));
const maybeDescribe = HAS_FIXTURES ? describe : describe.skip;

maybeDescribe('mapping a parsed explanation end-to-end', () => {
  for (const fx of POST_FIXTURES) {
    test(`${fx.file} — parsed system "${fx.standards!.system}" → ${fx.mappedSystem}`, () => {
      const { dispose } = loadFixture(fx.file);
      try {
        const q = parseQuestion();
        expect(q).not.toBeNull();
        const ex = parseExplanation(q!);
        expect(ex).not.toBeNull();
        expect(ex!.system).toBe(fx.standards!.system);
        expect(mapUworldSystem(ex!.system)).toBe(fx.mappedSystem!);
      } finally {
        dispose();
      }
    });
  }
});
