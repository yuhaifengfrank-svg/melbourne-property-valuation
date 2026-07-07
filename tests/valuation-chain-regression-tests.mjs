import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { checkHeritage } from '../lib/heritage-service.js';
import {
  hasUsableCoordinates,
  prioritizeSaleRows,
} from '../lib/db-comparable-source.js';
import {
  overridePropertyTypeFromAddress,
  preserveUnitAddress,
} from '../lib/valuation-service.js';
import {
  addressSignature,
  normalizeAddress,
} from '../lib/comparable-research-collector.js';

test('Unit hyphen syntax is preserved without treating a House range as a Unit', () => {
  assert.equal(overridePropertyTypeFromAddress('2-11 McIntosh St, Oakleigh', 'Unit'), 'Unit');
  assert.equal(overridePropertyTypeFromAddress('5-7 Old Warrandyte Rd', 'House'), 'House');
  assert.equal(preserveUnitAddress(
    '2-11 McIntosh St, Oakleigh',
    '11 McIntosh Street, Oakleigh, VIC 3166',
    'Unit'
  ), '2/11 McIntosh Street, Oakleigh, VIC 3166');
});

test('core parser preserves hyphen ranges and resolves them only with a type hint', () => {
  assert.match(normalizeAddress('5-7 Old Warrandyte Rd'), /^5-7 old warrandyte road$/);

  const houseRange = addressSignature('5-7 Old Warrandyte Rd', 'House');
  assert.equal(houseRange.streetNumber, '5-7');
  assert.equal(houseRange.unitNumber, '');
  assert.equal(houseRange.hasUnitSignal, false);

  const unitHyphen = addressSignature('2-11 McIntosh St', 'Unit');
  assert.equal(unitHyphen.unitNumber, '2');
  assert.equal(unitHyphen.streetNumber, '11');
  assert.equal(unitHyphen.hasUnitSignal, true);

  const unresolved = addressSignature('2-11 McIntosh St');
  assert.equal(unresolved.hasUnitSignal, false);
  assert.equal(unresolved.ambiguousHyphen, true);
});

test('comparable priority does not prefer Unit labels over compatible built forms', () => {
  const input = [
    { property_type: 'Townhouse', verification_status: 'cross_source_verified', sale_date: '2026-01-01' },
    { property_type: 'Unit', verification_status: 'single_source_observed', sale_date: '2025-01-01' },
    { property_type: 'Unit', verification_status: 'unverified', sale_date: '2026-02-01' },
  ];
  const pooled = prioritizeSaleRows(input);
  assert.equal(pooled[0].property_type, 'Townhouse');
});

test('Unit compatibility includes Townhouse and Villa but excludes Apartment', () => {
  const source = fs.readFileSync(new URL('../lib/db-comparable-source.js', import.meta.url), 'utf8');
  assert.match(source, /Unit:\s*new Set\(\['Unit', 'Townhouse', 'Villa'\]\)/);
  assert.doesNotMatch(source, /Unit:\s*new Set\(\[[^\]]*'Apartment'/);
  const engine = fs.readFileSync(new URL('../lib/valuation-engine.js', import.meta.url), 'utf8');
  assert.match(engine, /Unit:\s*new Set\(\["Unit", "Townhouse", "Villa"\]\)/);
});

test('cross-source verification contributes to engine source quality', () => {
  const engine = fs.readFileSync(new URL('../lib/valuation-engine.js', import.meta.url), 'utf8');
  assert.match(engine, /comp\.verificationStatus === "cross_source_verified"/);
  assert.match(engine, /r\.verificationStatus === "cross_source_verified"/);
});

test('NaN and zero coordinates are not treated as usable', () => {
  assert.equal(hasUsableCoordinates('NaN', 'NaN'), false);
  assert.equal(hasUsableCoordinates(0, 0), false);
  assert.equal(hasUsableCoordinates(-37.9, 145.1), true);
});

test('Heritage service accepts Neon array query results', async () => {
  const result = await checkHeritage({
    query: async () => [{ vhr_num: 'H1234', site_name: 'Test Place' }],
  }, -37.9, 145.1, null);
  assert.equal(result.flagged, true);
  assert.deepEqual(result.sources, ['VHR']);
  assert.equal(result.details[0].code, 'H1234');
});

test('public valuation response does not expose raw server errors', () => {
  const api = fs.readFileSync(new URL('../api/valuation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(api, /error:\s*error\.message/);
  assert.match(api, /code:\s*"VALUATION_UNAVAILABLE"/);
  assert.match(api, /valuationMode:\s*fullResult\.valuationMode/);
  assert.match(api, /heritage:\s*fullResult\.heritage/);
});

test('frontends do not globally rewrite hyphenated street ranges as units', () => {
  for (const relativePath of ['../public/app.js', '../app.js']) {
    const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /replace\(\/\\b\(\\d\+\)\\s\*-\\s\*\(\\d\+\)\\b\/g, "\$1\/\$2"\)/);
  }
});
