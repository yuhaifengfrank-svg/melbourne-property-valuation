import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isValidVictoriaCoordinatePair, normalizeVictoriaCoordinates } from '../lib/coordinate-policy.js';

test('accepts a finite coordinate pair inside Victoria', () => {
  assert.equal(isValidVictoriaCoordinatePair(-37.8136, 144.9631), true);
  assert.deepEqual(normalizeVictoriaCoordinates('-37.8136', '144.9631'), { lat: -37.8136, lon: 144.9631 });
});

for (const [name, lat, lon] of [
  ['NaN', Number.NaN, 144.9631],
  ['zero', 0, 0],
  ['missing latitude', null, 144.9631],
  ['missing longitude', -37.8136, null],
  ['out of Victoria', -33.0, 151.0],
  ['invalid text', 'unknown', 'unknown'],
]) {
  test(`${name} coordinates normalize to a NULL pair`, () => {
    assert.deepEqual(normalizeVictoriaCoordinates(lat, lon), { lat: null, lon: null });
  });
}

test('database schema guards every comparable-sales writer', () => {
  const schema = fs.readFileSync(new URL('../lib/db-schema.js', import.meta.url), 'utf8');
  assert.match(schema, /BEFORE INSERT OR UPDATE OF lat, lon ON comparable_sales/);
  assert.match(schema, /NEW\.lat := NULL;\s*NEW\.lon := NULL;/);
  assert.match(schema, /comparable_sales_valid_victoria_coordinates/);
  assert.match(schema, /NOT VALID/);
});

test('preview seed normalizes coordinates before insert', () => {
  const seed = fs.readFileSync(new URL('../lib/seed-preview.mjs', import.meta.url), 'utf8');
  assert.match(seed, /normalizeVictoriaCoordinates\(r\.lat, r\.lon\)/);
});
