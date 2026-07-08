import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { displayName, pageFilename } from '../scripts/generate-suburb-pages.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAGE_DIR = path.join(ROOT, 'public', 'suburb');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'suburb-page-source.json'), 'utf8'));

function extractPageData(html) {
  const match = html.match(/<script id="suburb-page-data" type="application\/json">([^<]+)<\/script>/);
  assert.ok(match, 'missing #suburb-page-data');
  return JSON.parse(match[1]);
}

function parseJsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
}

test('snapshot contains the complete canonical suburb set', () => {
  assert.equal(SNAPSHOT.schemaVersion, 1);
  assert.equal(SNAPSHOT.rows.length, 248);
  assert.equal(new Set(SNAPSHOT.rows.map(row => `${row.suburb}|${row.state}`)).size, 248);
  assert.deepEqual([...new Set(SNAPSHOT.rows.map(row => row.state))].sort(), ['NSW', 'VIC']);
});

test('every source row has one state-aware canonical page', () => {
  const canonicalFiles = SNAPSHOT.rows.map(pageFilename).sort();
  const actualFiles = fs.readdirSync(PAGE_DIR).filter(file => file.endsWith('.html')).sort();
  assert.equal(actualFiles.length, 249, 'expected 248 canonical pages plus one legacy redirect');
  assert.deepEqual(actualFiles.filter(file => file !== 'sans-souci-vic.html'), canonicalFiles);
  assert.ok(actualFiles.includes('sans-souci-nsw.html'));
});

test('all visible pages match the structured source snapshot', () => {
  for (const source of SNAPSHOT.rows) {
    const file = pageFilename(source);
    const html = fs.readFileSync(path.join(PAGE_DIR, file), 'utf8');
    const embedded = extractPageData(html);
    assert.deepEqual(embedded, { schemaVersion: 1, ...source }, `${file}: embedded data differs`);
    assert.match(html, new RegExp(`<h1>${displayName(source.suburb)}, ${source.state}</h1>`));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.aushomevalue\\.com\\.au/suburb/${file}"`));
    assert.ok(!/\b(?:undefined|NaN)\b/.test(html), `${file}: invalid literal`);
    assert.ok(!/updated nightly/i.test(html), `${file}: unsupported update-frequency claim`);
    assert.ok(!/based on recent comparable sales data/i.test(html), `${file}: unsupported provenance claim`);

    const schemas = parseJsonLd(html);
    assert.equal(schemas.length, 2, `${file}: expected Place and FAQPage schemas`);
    assert.equal(schemas[0]['@type'], 'Place');
    assert.equal(schemas[1]['@type'], 'FAQPage');
  }
});

test('missing and anomalous metrics fail closed', () => {
  const missingUnits = SNAPSHOT.rows.filter(row => row.medianUnitPrice == null);
  const missingConfidence = SNAPSHOT.rows.filter(row => row.overallConfidence == null);
  const suppressedVacancy = SNAPSHOT.rows.filter(row => row.vacancySuppressed);
  assert.equal(missingUnits.length, 43);
  assert.equal(missingConfidence.length, 33);
  assert.equal(suppressedVacancy.length, 15);
  assert.ok(suppressedVacancy.every(row => row.vacancyRate == null));

  for (const row of suppressedVacancy) {
    const html = fs.readFileSync(path.join(PAGE_DIR, pageFilename(row)), 'utf8');
    assert.match(html, /Source value withheld because it falls outside the publishable 0-15% range\./);
  }
});

test('legacy Sans Souci VIC URL redirects to the NSW canonical page', () => {
  const html = fs.readFileSync(path.join(PAGE_DIR, 'sans-souci-vic.html'), 'utf8');
  assert.match(html, /name="robots" content="noindex"/);
  assert.match(html, /sans-souci-nsw\.html/);
});
