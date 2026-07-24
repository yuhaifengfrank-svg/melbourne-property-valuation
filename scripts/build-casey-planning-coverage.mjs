#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://data.casey.vic.gov.au/explore/dataset/planning-permit-applications-register-only/api/";
const arg = (name) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const registerPath = arg("--register");
if (!registerPath) throw new Error("Usage: build-casey-planning-coverage.mjs --register <json>");

const allRows = JSON.parse(fs.readFileSync(registerPath, "utf8"));
if (!Array.isArray(allRows)) throw new Error("Casey register export must be a JSON array");
const rows = allRows.filter((row) =>
  String(row.lodged_year || "") === "2025"
  || String(row.lodged_date || "").startsWith("2025-"));
if (!rows.length) throw new Error("No 2025 Casey planning records found");

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (value) => value.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
const retrievedAt = new Date().toISOString();
const groups = new Map();

for (const row of rows) {
  const suburb = String(row.suburb || "").trim().toUpperCase();
  const postcode = String(row.postcode || "").trim();
  if (!suburb || !/^\d{4}$/.test(postcode)) throw new Error("Publication gate failed: missing suburb or postcode");
  const key = `${suburb}|${postcode}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

function makeArtifact(suburb, postcode, exactRows) {
  const ids = exactRows.map((row) => String(row.application_number || "").trim());
  const quality = {
    sourceRows: rows.length,
    exactGeographyRows: exactRows.length,
    missingApplicationNumber: exactRows.filter((row) => !row.application_number).length,
    missingLodgedDate: exactRows.filter((row) => !row.lodged_date).length,
    missingDescription: exactRows.filter((row) => !row.description).length,
    duplicateExactApplicationNumbers: ids.length - new Set(ids).size,
    allCouncilGeographyRowsAccountedFor: rows.length,
    recordLevelReuse: "Internal validation only; public output is aggregate only",
  };
  if (quality.missingApplicationNumber || quality.missingLodgedDate
    || quality.missingDescription || quality.duplicateExactApplicationNumbers) {
    throw new Error(`Publication gate failed for ${suburb}`);
  }
  const decisions = exactRows.filter((row) => String(row.decision_date || "").trim());
  const active = exactRows.filter((row) => /^current$/i.test(String(row.status || "").trim()));
  return {
    schemaVersion: "planning-pipeline-summary-v1",
    source: {
      publisher: "City of Casey",
      url: SOURCE,
      retrievedAt,
      sourceReport: "Planning Permit Application Register — official open-data API",
      licence: "CC BY 3.0",
    },
    filters: {
      lodgedStart: "2025-01-01",
      lodgedEnd: "2025-12-31",
      suburb,
      postcode,
    },
    geography: {
      council: "City of Casey",
      councilCoverage: "council_records_only",
      note: `Only applications recorded by City of Casey for ${title(suburb)} ${postcode}`,
    },
    quality,
    summary: {
      lodgedApplicationCount: exactRows.length,
      uniqueProjectCount: new Set(ids).size,
      decisionRecordedCount: decisions.length,
      activeApplicationCount: active.length,
    },
    publication: {
      publishable: true,
      pagePublished: true,
      grain: `Aggregate applications lodged in 2025 and recorded by City of Casey for ${title(suburb)} ${postcode}`,
      statusReferenceDate: retrievedAt.slice(0, 10),
      limitations: [
        "Application counts are not dwelling counts, commencements or completions",
        "Decision recorded means the open register contains a decision date; it is not a development completion",
        "Current application means the official public status is Current and may change",
        "This summary includes City of Casey records only and does not infer whole-suburb coverage",
        "No record-level address or personal information is published",
      ],
    },
  };
}

function markup(data) {
  const summary = data.summary;
  return `
<!-- AHV_CASEY_PLANNING_START -->
<style id="ahv-casey-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta,.ahv-planning-card p{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}.ahv-planning-meta{font-size:.8rem}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-casey-planning-heading">
  <h2 id="ahv-casey-planning-heading">Casey planning pipeline</h2>
  <p class="ahv-planning-intro">City of Casey planning applications lodged in 2025 · Casey council records only. Applications are not dwelling counts, commencements or completions.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Lodged applications</div><div class="ahv-planning-value">${summary.lodgedApplicationCount}</div><div class="ahv-planning-meta">Exact suburb and postcode match</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Unique projects</div><div class="ahv-planning-value">${summary.uniqueProjectCount}</div><div class="ahv-planning-meta">Unique application numbers</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Decision dated</div><div class="ahv-planning-value">${summary.decisionRecordedCount}</div><div class="ahv-planning-meta">Register decision date present</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Current applications</div><div class="ahv-planning-value">${summary.activeApplicationCount}</div><div class="ahv-planning-meta">Official public status is Current</div></article>
  </div>
</section>
<!-- AHV_CASEY_PLANNING_END -->
`;
}

function planningOnlyPage(suburb, postcode) {
  const name = title(suburb);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} VIC Planning Research | AusHomeValue</title><meta name="description" content="Source-labelled City of Casey planning data for ${name}, Victoria."><link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${slug(suburb)}-vic.html"><meta name="robots" content="index, follow"><link rel="stylesheet" href="/shared-responsive.css"><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:960px;margin:auto;padding:32px 20px 12px}.breadcrumb,.eyebrow,.notice{color:#66736d}.notice{max-width:920px;margin:0 auto 48px;padding:14px 16px;background:#e8f3ef;border-left:4px solid #0d6b57;border-radius:6px}</style></head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${name}</div><h1>${name}, VIC — Planning Research</h1><p class="eyebrow">Postcode ${postcode} · City of Casey records · Only verified, source-labelled metrics are shown.</p></main><!-- AHV_CASEY_PLANNING_INSERT --><div class="notice"><strong>Data availability:</strong> other market metrics are omitted until an approved source and definition are available.</div></body></html>`;
}

function inject(suburb, postcode, data) {
  const file = path.join(ROOT, "public", "suburb", `${slug(suburb)}-vic.html`);
  let html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : planningOnlyPage(suburb, postcode);
  html = html.replace(/[\r\n]*<!-- AHV_CASEY_PLANNING_START -->[\s\S]*?<!-- AHV_CASEY_PLANNING_END -->[\r\n]*/g, "");
  html = html.includes("<!-- AHV_CASEY_PLANNING_INSERT -->")
    ? html.replace("<!-- AHV_CASEY_PLANNING_INSERT -->", markup(data))
    : html.replace("</body>", `${markup(data)}</body>`);
  fs.writeFileSync(file, html);
}

const summaries = [];
let accounted = 0;
for (const [key, exactRows] of [...groups.entries()].sort()) {
  const [suburb, postcode] = key.split("|");
  const data = makeArtifact(suburb, postcode, exactRows);
  accounted += exactRows.length;
  fs.writeFileSync(
    path.join(ROOT, "data", "validation", `${slug(suburb)}-casey-planning-pipeline-2025.json`),
    `${JSON.stringify(data, null, 2)}\n`,
  );
  inject(suburb, postcode, data);
  summaries.push({ suburb, postcode, ...data.summary });
}
if (accounted !== rows.length) throw new Error(`Coverage mismatch: ${accounted} != ${rows.length}`);
console.log(JSON.stringify({ sourceRows: rows.length, accountedRows: accounted, areas: summaries }, null, 2));
