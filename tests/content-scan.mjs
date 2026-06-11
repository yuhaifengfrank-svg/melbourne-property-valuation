/**
 * content-scan.mjs — Scan HTML files + generator scripts for disallowed phrasing.
 * Phase 0A / Codex 2026-06-11 constraints:
 *  - No "Strong 3-year growth"
 *  - No "Recent 1-year momentum"
 *  - No "forecast price appreciation"
 *  - No "sustained capital growth"
 *  - No "weighted 1, 3 and 5-year price growth"
 *  - No "weighted 1, 3 and 5-year price appreciation"
 *  - No "highest-growth suburbs ranked by weighted price appreciation"
 *  - No "1-year (25%), 3-year (50%), 5-year (25%)" weighting weights
 *  - No "% 3-year growth observed" or "% 1-year change observed"
 *  - No "ranked by growth score"
 * Reason: growth_1y/growth_3y are ~136-day OLS trend extrapolations, not actual returns.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const EXACT_DISALLOWED = [
  'Strong 3-year growth',
  'Recent 1-year momentum',
  'forecast price appreciation',
  'sustained capital growth',
];

// Phase 0A: these implied measured multi-year growth when data is ~136-day OLS
const PHRASE_DISALLOWED_SUBSTR = [
  'weighted 1, 3 and 5-year price growth',
  'weighted 1, 3 and 5-year price appreciation',
  'highest-growth suburbs ranked by weighted price appreciation',
];

// Regex patterns for forbidden phrasing
const FORBIDDEN_REGEX = [
  { re: /1-year \(25%\)[,]?\s*3-year \(50%\)[,]?\s*5-year \(25%\)/, label: 'weighting ratio (1y/3y/5y)' },
  { re: /1-year \(25%\).*3-year \(50%\).*5-year \(25%\)/s, label: 'weighting ratio (non-contiguous)' },
  { re: /% 3-year growth observed/, label: 'disguised 3-year percentage' },
  { re: /% 1-year change observed/, label: 'disguised 1-year percentage' },
  { re: /ranked by.*growth score/i, label: 'ranked by growth score' },
];

const SCAN_DIRS = ['public', 'scripts'];
const SCAN_EXTS = ['.html', '.cjs', '.mjs'];
let failures = [];

function scanFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return;
  }
  const isCjs = filePath.endsWith('.cjs');
  const lines = content.split('\n');

  // Helper: skip lines that are comments or replace patterns in generator code
  const isReplaceLine = (line) => isCjs && (line.includes('.replace(') || line.trimStart().startsWith('*') || line.trimStart().startsWith('//'));

  // 1. Exact disallowed phrases
  for (const phrase of EXACT_DISALLOWED) {
    if (content.includes(phrase)) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(phrase) && !isReplaceLine(lines[i])) {
          failures.push(`${filePath}:${i+1}: exact disallowed phrase "${phrase}"`);
        }
      }
    }
  }

  // 2. Substring disallowed phrases (for multi-word patterns)
  for (const phrase of PHRASE_DISALLOWED_SUBSTR) {
    if (content.toLowerCase().includes(phrase.toLowerCase())) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(phrase.toLowerCase()) && !isReplaceLine(lines[i])) {
          failures.push(`${filePath}:${i+1}: disallowed phrase "${phrase}"`);
        }
      }
    }
  }

  // 3. Regex forbidden patterns
  for (const { re, label } of FORBIDDEN_REGEX) {
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i]) && !isReplaceLine(lines[i])) {
        failures.push(`${filePath}:${i+1}: ${label}: ${lines[i].trim().substring(0,100)}`);
      }
    }
  }

  // 4. "forecast" used as price/growth/appreciation prediction (not disclaimer)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isReplaceLine(line)) continue;
    if (line.toLowerCase().includes('not a forecast') || line.includes('calibrated') || line.includes('Beta composite')) continue;
    if (line.match(/forecast.*(price|growth|appreciation|value)/i)) {
      failures.push(`${filePath}:${i+1}: 'forecast' in disallowed context: ${line.trim().substring(0,100)}`);
    }
  }

  // 5. "sustained long-term appreciation" or "sustained capital growth"
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isReplaceLine(line)) continue;
    if (line.match(/sustained.*(long.?term|capital).*(growth|appreciation|demand)/i)) {
      failures.push(`${filePath}:${i+1}: 'sustained growth' phrasing: ${line.trim().substring(0,100)}`);
    }
  }

  // 6. Percentage growth without safe qualifier
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isReplaceLine(line)) continue;
    if (line.match(/\d+\.?\d*%\s*(growth|appreciation|return|gain|increase)/i) &&
        !line.toLowerCase().includes('observed') &&
        !line.includes('disclaimer') &&
        !line.includes('experimental') &&
        !line.includes('Beta') &&
        !line.includes('historical') &&
        !line.includes('not a forecast') &&
        !line.includes('calibrated')) {
      failures.push(`${filePath}:${i+1}: percentage growth without safe qualifier: ${line.trim().substring(0,100)}`);
    }
  }
}

for (const dir of SCAN_DIRS) {
  if (!existsSync(dir)) continue;
  const walkDir = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      const st = statSync(p, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isDirectory() && !p.includes('node_modules')) {
        walkDir(p);
      } else if (SCAN_EXTS.some(ext => p.endsWith(ext))) {
        scanFile(p);
      }
    }
  };
  walkDir(dir);
}

if (failures.length) {
  console.log(`\n❌ ${failures.length} disallowed content violations found:\n`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
} else {
  console.log(`\n✅ No disallowed content in scanned files (${SCAN_DIRS.join(', ')})`);
}
