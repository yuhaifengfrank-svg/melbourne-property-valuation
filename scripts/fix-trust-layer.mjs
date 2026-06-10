/**
 * fix-trust-layer.mjs — Rebuild trust-layer.js cleanly
 * 
 * Problem: Duplicated sections from repeated edits, 
 * corrupted buildSuitabilityHTML body in first occurrence.
 * 
 * Fix: Extract clean sections from first run + complete
 * buildSuitabilityHTML from second occurrence.
 */

import fs from 'fs';

const FILE = '/Users/FrankAI/Documents/澳洲房地产评估系统/public/trust-layer.js';
const content = fs.readFileSync(FILE, 'utf8');
const lines = content.split('\n');
const totalLines = lines.length;

console.log(`Total lines: ${totalLines}`);

// Verify we have the right structure
const keyLines = {
  buildSuitabilityFn: findLine(lines, 'function buildSuitabilityHTML'),
  globalTrustLayer1: findLine(lines, 'global.TrustLayer = {'),
  globalTrustLayer2: findLine(lines, 'global.TrustLayer = {', findLine(lines, 'global.TrustLayer = {') + 1),
  globalTrustLayer3: findLine(lines, 'global.TrustLayer = {', findLine(lines, 'global.TrustLayer = {', findLine(lines, 'global.TrustLayer = {') + 1) + 1),
};

console.log('Key line positions:', JSON.stringify(keyLines, null, 2));

// Strategy: 
// Part A: Lines 1 to just before first global.TrustLayer export (header + CSS + conf + whyHTML + all functions, minus duplicate)
// Part B: After global.TrustLayer, find the last occurrence of the closing IIFE and that's the real end

// Actually, the simplest approach: keep line 1 through the end of the last global.TrustLayer + closing
// But we need to make sure buildSuitabilityHTML at 396 has its proper body

// Let me check: does the buildSuitabilityHTML at line 396 have the types array?
const line396 = lines[395]; // 0-indexed
const line397 = lines[396];
const line398 = lines[397];
const line399 = lines[398];
console.log(`Line 396-399: ${JSON.stringify([line396, line397, line398, line399])}`);
console.log(`Line 748-752: ${JSON.stringify([
  lines[747], lines[748], lines[749], lines[750], lines[751]
])}`);

// The corrupted buildSuitabilityHTML at 396 ends around line 442 (that's renderWithData code)
// The types array is orphaned around line 749
// We need to:
// 1. Remove lines 438-> (the corrupted render withData) through 750 (before orphaned types)
// 2. Replace with the types + html generation from 750+
// Then everything else should work

// Actually let me trace more precisely
function findLine(arr, substr, startIdx = 0) {
  for (let i = startIdx; i < arr.length; i++) {
    if (arr[i] && arr[i].includes(substr)) return i + 1; // 1-indexed
  }
  return -1;
}

// Find where fmtPx ends and corrupted code starts
const fmtPxStart = findLine(lines, 'function fmtPx');
const fmtPxReturn = findLine(lines, 'return "";', fmtPxStart); // line after "return '';"

let corruptStart = -1;
for (let i = fmtPxReturn; i < lines.length; i++) {
  if (lines[i-1] && lines[i] && lines[i] === '    opts = opts || {};') {
    corruptStart = i + 1;
    break;
  }
}
console.log(`fmtPx at ${fmtPxStart}, return '' at ${fmtPxReturn}`);
console.log(`Corrupt start at ${corruptStart}`);

// Now find where the clean types array starts (from second insertion)
const typesStart = findLine(lines, 'var types = [');
console.log(`First types at ${typesStart}`);

// Find the third global.TrustLayer (the real export)
const gl3 = findLine(lines, 'global.TrustLayer = {', 
  findLine(lines, 'global.TrustLayer = {',
    findLine(lines, 'global.TrustLayer = {') + 1) + 1);
console.log(`Third global.TrustLayer at ${gl3}`);

// So the clean rebuild:
// Part 1: lines 1 to (typesStart - 1)
// Part 2: lines from typesStart through (gl3 + 5) [to include closing ]])
const endLine = gl3 + 4; // covers the closing }); at gl3+4

console.log(`Part 1: 1-${typesStart - 1}`);
console.log(`Part 2: ${typesStart}-${endLine}`);
console.log(`Total output lines: ${(typesStart - 1) + (endLine - typesStart + 1)}`);

const part1 = lines.slice(0, typesStart - 1);
const part2 = lines.slice(typesStart - 1, endLine);

const rebuilt = part1.concat(part2).join('\n');

fs.writeFileSync(FILE, rebuilt, 'utf8');
console.log(`\nWritten ${part1.length + part2.length} lines`);

// Verify syntax
try {
  new Function(rebuilt);
  console.log('✅ Syntax OK');
} catch (e) {
  console.log(`❌ Syntax error: ${e.message}`);
  // Show context around error
  const m = e.stack.match(/:(\d+)(?::\d+)?\n/);
  if (m) {
    const errLine = parseInt(m[1]);
    console.log(`Around line ${errLine}:`);
    const split = rebuilt.split('\n');
    for (let i = Math.max(0, errLine - 3); i < Math.min(split.length, errLine + 2); i++) {
      console.log(`  ${i+1}: ${split[i]}`);
    }
  }
}
