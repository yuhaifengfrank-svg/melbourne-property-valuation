import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const pageNames = [
  'top-growth-suburbs-victoria',
  'top-value-suburbs-victoria',
  'top-yield-suburbs-victoria',
  'top-school-zone-suburbs-victoria',
  'top-supply-constrained-suburbs-victoria',
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('top-page generators render factor and opportunity scores on a /100 scale', () => {
  const legacyGenerator = read('scripts/generate-top-pages.cjs');
  const researchGenerator = read('scripts/generate-research-pages.cjs');

  assert.match(legacyGenerator, /opportunityScore[^\n]+\/100/);
  assert.match(legacyGenerator, /factorScore[^\n]+\/100/);
  assert.match(researchGenerator, /scoreDisplay[^\n]+\/100/);
  assert.match(researchGenerator, /oppDisplay[^\n]+\/100/);
});

test('generated top pages do not present normalized scores as percentages', () => {
  const pages = [
    ...pageNames.map(name => `public/${name}.html`),
    ...pageNames.map(name => `public/research/${name}-2026.html`),
  ];

  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /<span class="tag tag-opp">Opp [\d.]+<\/span>/, page);
    assert.match(html, /<span class="tag tag-opp">Opp [\d.]+\/100<\/span>/, page);

    const factorValues = [...html.matchAll(
      /<span class="stat-label">(?:Growth|Value|Yield|Schools|Supply)<\/span>\s*<span class="stat-value">([^<]+)<\/span>/g,
    )].map(match => match[1]);

    assert.ok(factorValues.length > 0, `${page} should contain factor scores`);
    assert.ok(factorValues.every(value => /^\d+(?:\.\d+)?\/100$/.test(value)), page);
  }
});

test('confidence remains a percentage', () => {
  const html = read('public/research/top-growth-suburbs-victoria-2026.html');
  assert.match(
    html,
    /<span class="stat-label">Confidence<\/span>\s*<span class="stat-value">[\d.]+%<\/span>/,
  );
});
