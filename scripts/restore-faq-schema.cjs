#!/usr/bin/env node
/**
 * restore-faq-schema.cjs — Batch restore FAQPage LD+JSON schema + visual FAQ section
 *
 * Injects into all existing /public/suburb/*.html pages:
 * 1. FAQPage structured data <script> in <head>
 * 2. Visible FAQ section before the closing </div> of .container
 *
 * Reads each page's existing Place LD+JSON to extract suburb data.
 * Run: node scripts/restore-faq-schema.cjs
 * Dry-run: DRY_RUN=1 node scripts/restore-faq-schema.cjs
 */

const fs = require('fs');
const path = require('path');

const SUBURB_DIR = path.join(__dirname, '..', 'public', 'suburb');
const DRY_RUN = process.env.DRY_RUN === '1';

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJson(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/**
 * Parse existing Place LD+JSON block from suburb page HTML.
 */
function parsePlaceLdJson(html) {
  const match = html.match(/<script type="application\/ld\+json">\s*({[\s\S]*?})\s*<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    return null;
  }
}

/**
 * Build score-available factors list from scores object, filtering NaN/out-of-range.
 */
function getAvailableFactors(scores) {
  const factorNames = ['growth', 'value', 'yield', 'vacancy', 'school', 'income', 'population', 'supply', 'infrastructure'];
  const factorLabels = {
    growth: 'Growth', value: 'Value', yield: 'Yield', vacancy: 'Vacancy',
    school: 'School', income: 'Income', population: 'Population',
    supply: 'Supply', infrastructure: 'Infrastructure'
  };
  const factorScoreMap = {
    growth: scores.growthScore, value: scores.valueScore, yield: scores.yieldScore,
    vacancy: scores.vacancyScore, school: scores.schoolScore, income: scores.incomeScore,
    population: scores.populationScore, supply: scores.supplyScore, infrastructure: scores.infrastructureScore
  };
  return factorNames
    .map(f => ({ name: factorLabels[f], score: factorScoreMap[f] }))
    .filter(f => f.score != null && !isNaN(f.score) && f.score >= 0 && f.score <= 100)
    .sort((a, b) => b.score - a.score);
}

/**
 * Build FAQPage LD+JSON block from suburb data.
 * Dynamically adapts to available factor data — old-format pages only have
 * Opportunity Score + School Score; new-format pages have all 9 factors.
 */
function buildFaqPageSchema(suburb, state, scores) {
  const scoreLabel = scores.opportunityScore != null ? `${scores.opportunityScore}/100` : 'not available';
  const schoolLabel = scores.schoolScore != null ? `${scores.schoolScore}/100` : 'not available';

  const available = getAvailableFactors(scores);
  const top3 = available.length > 0
    ? available.slice(0, 3).map(f => `${f.name} ${f.score}/100`).join(', ')
    : 'not available';
  const strongest = available.length > 0
    ? `${available[0].name} (${available[0].score}/100)`
    : 'Opportunity Score';
  const investSignals = available.filter(f => f.name !== 'School').length > 0
    ? available.filter(f => f.name !== 'School').slice(0, 3).map(f => `${f.name} ${f.score}/100`).join(', ')
    : null;

  const investSignalStr = investSignals
    ? `Key signals: ${investSignals}. School: ${schoolLabel}.`
    : `School: ${schoolLabel}. Overall opportunity: ${scoreLabel}.`;

  const topStr = available.length > 0
    ? top3
    : `Opportunity Score: ${scoreLabel}`;

  const faqs = [
    {
      "@type": "Question",
      "name": `What is the property opportunity score for ${suburb}?`,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": `${suburb} scores ${scoreLabel} on AusHomeValue's opportunity scale. Scores range 0\u2013100 and combine growth, value, yield, school quality, income, population, supply, infrastructure and vacancy factors.`
      }
    },
    {
      "@type": "Question",
      "name": `How does ${suburb} score on school quality?`,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": `${suburb} scores ${schoolLabel} for school quality. This is based on ACARA ICSEA data and proximity to high-ranking schools in the area.`
      }
    },
    {
      "@type": "Question",
      "name": `Is ${suburb} a good area for property investment?`,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": `${suburb}'s opportunity score of ${scoreLabel} reflects a composite of 9 investment factors. ${investSignalStr} This is a relative opportunity index, not a price forecast or investment guarantee. Always conduct your own due diligence.`
      }
    },
    {
      "@type": "Question",
      "name": `What are the strongest investment signals for ${suburb}?`,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": `The highest-scoring factors for ${suburb} are: ${topStr}. Higher scores indicate stronger relative signals compared to other suburbs in the dataset.`
      }
    }
  ];

  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs
  }, null, 2);
}

/**
 * Build visual FAQ HTML section.
 */
function buildFaqHtml(suburb, scores) {
  const scoreLabel = scores.opportunityScore != null ? `${scores.opportunityScore}/100` : `not available`;
  const schoolLabel = scores.schoolScore != null ? `${scores.schoolScore}/100` : null;

  const available = getAvailableFactors(scores);
  const top3 = available.length > 0
    ? available.slice(0, 3).map(f => `${f.name} ${f.score}/100`).join(', ')
    : 'Opportunity Score ' + scoreLabel;
  const strongest = available.length > 0
    ? `${available[0].name} (${available[0].score}/100)`
    : 'Opportunity Score';

  return `
    <h2 class="section-title" style="margin-top:48px;">❓ Frequently Asked Questions — ${escapeHtml(suburb)} Property</h2>
    <div class="faq-section" style="margin-bottom:32px;">
      <div class="faq-item" style="background:white;border:1px solid #dbe2de;border-radius:10px;padding:16px;margin-bottom:12px;">
        <div class="faq-q" style="font-weight:600;margin-bottom:6px;">What is the property opportunity score for ${escapeHtml(suburb)}?</div>
        <div class="faq-a" style="color:#4a5650;font-size:0.9rem;">${escapeHtml(suburb)} scores ${scoreLabel} on AusHomeValue's opportunity scale. Scores range 0–100 and combine growth, value, yield, school quality, income, population, supply, infrastructure and vacancy factors.</div>
      </div>
      <div class="faq-item" style="background:white;border:1px solid #dbe2de;border-radius:10px;padding:16px;margin-bottom:12px;">
        <div class="faq-q" style="font-weight:600;margin-bottom:6px;">How does ${escapeHtml(suburb)} score on school quality?</div>
        <div class="faq-a" style="color:#4a5650;font-size:0.9rem;">${escapeHtml(suburb)} scores ${schoolLabel != null ? schoolLabel + '/100' : 'not available'} for school quality. This is based on ACARA ICSEA data and proximity to high-ranking schools in the area.</div>
      </div>
      <div class="faq-item" style="background:white;border:1px solid #dbe2de;border-radius:10px;padding:16px;margin-bottom:12px;">
        <div class="faq-q" style="font-weight:600;margin-bottom:6px;">Is ${escapeHtml(suburb)} a good area for property investment?</div>
        <div class="faq-a" style="color:#4a5650;font-size:0.9rem;">${escapeHtml(suburb)}'s opportunity score of ${scoreLabel} reflects a composite of 9 investment factors. Top signals: ${top3}. Strongest factor: ${strongest}. This is a relative opportunity index, not a price forecast or investment guarantee. Always conduct your own due diligence.</div>
      </div>
      <div class="faq-item" style="background:white;border:1px solid #dbe2de;border-radius:10px;padding:16px;margin-bottom:12px;">
        <div class="faq-q" style="font-weight:600;margin-bottom:6px;">What are the strongest investment signals for ${escapeHtml(suburb)}?</div>
        <div class="faq-a" style="color:#4a5650;font-size:0.9rem;">The highest-scoring factors for ${escapeHtml(suburb)} are: ${top3}. Higher scores indicate stronger relative signals compared to other suburbs in the dataset.</div>
      </div>
    </div>`;
}

/**
 * Extract suburb data from Place LD+JSON and factor card HTML.
 */
function extractScores(html) {
  const scores = {
    valueScore: null,
    growthScore: null,
    yieldScore: null,
    vacancyScore: null,
    schoolScore: null,
    incomeScore: null,
    populationScore: null,
    supplyScore: null,
    infrastructureScore: null,
    opportunityScore: null,
  };

  // Try to extract confidence score from confidence bar (new format)
  const confMatch = html.match(/conf-badge[^>]*>(\d+)</);
  if (confMatch) {
    scores.opportunityScore = parseInt(confMatch[1], 10);
  }

  // Parse Place LD+JSON for factor scores
  // Handles both:
  // - New format: "Value Score", "Growth Score" etc. (integer values)
  // - Old format: "Opportunity Score", "School Score" etc. (string values like "65/100")
  const place = parsePlaceLdJson(html);
  if (place && Array.isArray(place.additionalProperty)) {
    for (const prop of place.additionalProperty) {
      if (prop.name === 'Opportunity Score' && scores.opportunityScore == null) {
        // Old format: value like "18.0/100" — extract numeric part
        const intMatch = String(prop.value).match(/^(\d+)(?:\.\d+)?\/100$/);
        if (intMatch) scores.opportunityScore = parseInt(intMatch[1], 10);
      } else if (prop.name === 'School Score' && scores.schoolScore == null) {
        const parts = String(prop.value).split('/');
        const v = parseInt(parts[0], 10);
        if (!isNaN(v)) scores.schoolScore = v;
      } else if (prop.name === 'Growth Score') {
        // New format: integer score 0-100
        const val = parseInt(prop.value, 10);
        if (!isNaN(val) && val >= 0 && val <= 100) scores.growthScore = val;
      } else if (prop.name === 'Growth Signal (experimental)') {
        // Old format: string like "-8.00%" — percentage change, NOT a 0-100 factor score
        // Explicitly skip — do not parse as growthScore
      } else {
        const val = parseInt(prop.value, 10);
        if (isNaN(val)) continue;
        if (prop.name === 'Value Score') scores.valueScore = val;
        else if (prop.name === 'Yield Score') scores.yieldScore = val;
        else if (prop.name === 'Vacancy Score') scores.vacancyScore = val;
        else if (prop.name === 'Income Score') scores.incomeScore = val;
        else if (prop.name === 'Population Score') scores.populationScore = val;
        else if (prop.name === 'Supply Score') scores.supplyScore = val;
        else if (prop.name === 'Infrastructure Score') scores.infrastructureScore = val;
      }
    }
  }

  return scores;
}

function processFile(filepath) {
  let html = fs.readFileSync(filepath, 'utf-8');

  // Extract suburb name from h1 (handles both "Property Intelligence" and "Property Market Analysis")
  const titleMatch = html.match(/<h1[^>]*>([^<]+),\s*([A-Z]+)\s*[—–-]?\s*Property (?:Intelligence|Market Analysis)/i);
  if (!titleMatch) {
    console.error(`  ⚠ Cannot find suburb name in ${path.basename(filepath)}`);
    return false;
  }
  const suburb = titleMatch[1].trim();
  const state = titleMatch[2].trim();

  // Check if FAQPage already exists and has correct data
  // Old-format pages may have "not available" due to missing score extraction in first pass
  const hasFaq = /FAQPage/.test(html);
  const hasBadData = /scores not available/i.test(html);
  if (hasFaq && !hasBadData) {
    console.log(`  ✓ FAQPage OK: ${path.basename(filepath)}`);
    return false;
  }
  if (hasFaq && hasBadData) {
    console.log(`  ⚠ FAQPage exists but has 'not available' data: ${path.basename(filepath)}`);
    // Safely remove only FAQPage LD+JSON blocks without touching Place/LocalBusiness blocks
    // Approach: split by <script type="application/ld+json">, parse each, filter out FAQPage, reassemble
    var parts = html.split(/<script type="application\/ld\+json">/);
    var newParts = [parts[0]];
    for (var i = 1; i < parts.length; i++) {
      var endTag = parts[i].indexOf('</script>');
      if (endTag === -1) {
        newParts.push('<script type="application/ld+json">' + parts[i]);
        continue;
      }
      var jsonStr = parts[i].substring(0, endTag);
      try {
        var obj = JSON.parse(jsonStr);
        if (obj['@type'] === 'FAQPage') {
          // Skip this block entirely
          newParts.push(parts[i].substring(endTag + 9)); // after </script>
        } else {
          newParts.push('<script type="application/ld+json">' + parts[i]);
        }
      } catch (e) {
        newParts.push('<script type="application/ld+json">' + parts[i]);
      }
    }
    html = newParts.join('');
  }

  const scores = extractScores(html);

  // Build FAQPage schema
  const faqSchemaJson = buildFaqPageSchema(suburb, state, scores);
  const faqSchemaHtml = `  <script type="application/ld+json">\n${faqSchemaJson}\n  </script>`;

  // Inject FAQPage schema before </head>
  const headInsert = html.indexOf('</head>');
  if (headInsert === -1) {
    console.error(`  ⚠ No </head> in ${path.basename(filepath)}`);
    return false;
  }

  // Check if page has the old-style visual FAQ block (class="faq" without FAQPage schema)
  const hasOldVisualFaq = /class="faq"/.test(html);

  // Inject FAQ schema (applies to both old and new format pages)
  html = html.slice(0, headInsert) + faqSchemaHtml + '\n' + html.slice(headInsert);

  // For new format pages (no visual FAQ), inject visual FAQ section before .footer
  if (!hasOldVisualFaq) {
    const faqHtml = buildFaqHtml(suburb, scores);
    // Recalculate footer position after head change
    const footerPos = html.indexOf('<div class="footer">');
    if (footerPos === -1) {
      console.error(`  ⚠ No footer in ${path.basename(filepath)}`);
      return false;
    }
    html = html.slice(0, footerPos) + faqHtml + '\n  ' + html.slice(footerPos);
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${hasOldVisualFaq ? 'schema-only' : 'full-inject'} for ${path.basename(filepath)}`);
    return true;
  }

  fs.writeFileSync(filepath, html, 'utf-8');
  console.log(`  ✓ ${path.basename(filepath)}${hasOldVisualFaq ? ' (schema only)' : ''}`);
  return true;
}

function main() {
  const files = fs.readdirSync(SUBURB_DIR).filter(f => f.endsWith('.html'));
  console.log(`Found ${files.length} suburb pages.\n`);

  let count = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filepath = path.join(SUBURB_DIR, file);
    const result = processFile(filepath);
    if (result === true) count++;
    else if (result === false) skipped++;
    else errors++;
  }

  console.log(`\nDone. ${count} updated, ${skipped} skipped, ${errors} errors.`);
  if (DRY_RUN) console.log('(DRY RUN — no files changed)');
}

main();
