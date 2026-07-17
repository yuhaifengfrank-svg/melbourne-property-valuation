#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { percentileScores } from "../lib/relative-score.js";

const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
if (!sourceArg) throw new Error("Use --source=/absolute/path/to/sanitized-suburb-metrics.json");
const sourcePath = sourceArg.slice("--source=".length);
const rows = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (!Array.isArray(rows) || rows.length === 0) throw new Error("Factor source is empty");

const definitions = [
  { key: "growth", label: "Growth", icon: "📈", raw: growthSignal },
  { key: "value", label: "Value", icon: "💎", raw: valueSignal, lowerIsBetter: true },
  { key: "yield", label: "Yield", icon: "💰", raw: (row) => finite(row.gross_yield) },
  { key: "school-zone", label: "Schools", icon: "🏫", raw: (row) => positive(row.school_score) },
  { key: "supply-constrained", label: "Supply", icon: "🏗️", raw: supplySignal },
];

for (const definition of definitions) {
  const rawValues = rows.map(definition.raw);
  const scores = percentileScores(rawValues, { lowerIsBetter: definition.lowerIsBetter });
  const ranked = rows
    .map((row, index) => ({ row, raw: rawValues[index], score: scores[index] }))
    .filter(({ score }) => score != null)
    .sort((a, b) => b.score - a.score
      || compareRaw(a.raw, b.raw, definition.lowerIsBetter)
      || (Number(b.row.overall_confidence) || 0) - (Number(a.row.overall_confidence) || 0)
      || String(a.row.suburb).localeCompare(String(b.row.suburb)));

  updatePage(
    path.resolve(`public/top-${definition.key}-suburbs-victoria.html`),
    ranked.slice(0, 100),
    definition,
    false,
  );
  updatePage(
    path.resolve(`public/research/top-${definition.key}-suburbs-victoria-2026.html`),
    ranked.slice(0, 100),
    definition,
    true,
  );
}

function updatePage(filePath, ranked, definition, research) {
  let html = fs.readFileSync(filePath, "utf8");
  const cards = ranked.map((item, index) => buildCard(item, index, definition, research)).join("\n");
  const start = html.indexOf('<div class="rank-list">');
  const footer = html.indexOf('\n  <div class="footer">', start);
  if (start < 0 || footer < 0) throw new Error(`Ranking container not found: ${filePath}`);
  const close = html.lastIndexOf("    </div>\n  </div>", footer);
  if (close < start) throw new Error(`Ranking close not found: ${filePath}`);
  html = `${html.slice(0, start)}<div class="rank-list">\n${cards}\n    </div>\n  </div>${html.slice(footer)}`;
  html = html.replace(
    /Scores combine market data, confidence calibrations,[^<]+/,
    "Scores are integer Victorian relative-ranking signals capped at 95/100. They are not price forecasts or guaranteed returns. ",
  );
  fs.writeFileSync(filePath, html);
}

function buildCard({ row, score }, index, definition, research) {
  const suburb = escapeHtml(titleCase(row.suburb));
  const slug = String(row.suburb).toLowerCase().replace(/[\s.]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
  const confidence = finite(row.overall_confidence);
  const price = positive(row.median_house_price) ?? positive(row.median_unit_price);
  const thirdStat = research
    ? `<span class="stat-label">Median Price</span><span class="stat-value">${formatPrice(price)}</span>`
    : `<span class="stat-label">Scale</span><span class="stat-type">Relative VIC percentile</span>`;
  return `
    <div class="rank-card" data-rank="${index + 1}">
      <div class="rank-number">${index + 1}</div>
      <div class="rank-body">
        <h3><a href="/suburb/${slug}-vic.html">${suburb}</a></h3>
        <div class="rank-meta"><span class="tag tag-${definition.key.replace("-zone", "").replace("-constrained", "")}">${definition.icon} ${definition.label}</span></div>
        <div class="rank-stats">
          <div class="stat"><span class="stat-label">${definition.label}</span><span class="stat-value">${score}/100</span></div>
          <div class="stat"><span class="stat-label">Confidence</span><span class="stat-value">${confidence == null ? "Data unavailable" : `${confidence.toFixed(1)}%`}</span></div>
          <div class="stat">${thirdStat}</div>
        </div>
        <ul class="explain-list"><li>Integer relative-ranking score across available Victorian suburbs</li><li>Screening signal — not a price forecast or guaranteed return</li></ul>
      </div>
    </div>`;
}

function growthSignal(row) {
  const entries = [[row.growth_1y, 1], [row.growth_3y, 2], [row.growth_5y, 1.5]]
    .map(([value, weight]) => [finite(value), weight])
    .filter(([value]) => value != null);
  if (entries.length === 0) return null;
  return entries.reduce((sum, [value, weight]) => sum + value * weight, 0)
    / entries.reduce((sum, [, weight]) => sum + weight, 0);
}

function valueSignal(row) {
  return positive(row.median_house_price) ?? positive(row.median_unit_price);
}

function supplySignal(row) {
  const constraint = finite(row.conf_supply_constraint);
  if (constraint == null) return null;
  const landRelease = finite(row.supply_land_release_indicator) ?? 30;
  const proximity = finite(row.supply_precinct_proximity) ?? 30;
  return constraint * 0.7 + (100 - landRelease) * 0.15 + proximity * 0.15;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const n = finite(value);
  return n != null && n > 0 ? n : null;
}

function compareRaw(a, b, lowerIsBetter) {
  if (a === b) return 0;
  return lowerIsBetter ? a - b : b - a;
}

function formatPrice(value) {
  if (value == null) return "Data unavailable";
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(2)}M` : `$${Math.round(value / 1000)}K`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function titleCase(value) {
  return String(value).toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
