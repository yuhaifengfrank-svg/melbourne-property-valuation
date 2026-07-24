#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDwellingYield, normalizePlanningApplication } from "../lib/planning-application-normalizer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER_SOURCE = "https://eservices.boroondara.vic.gov.au/EPlanning/pages/xc.report/reportsXdate.aspx?id=ppar";
const AREAS = [
  ["ASHBURTON", "3147", "full"],
  ["BALWYN", "3103", "full"],
  ["BALWYN NORTH", "3104", "full"],
  ["CAMBERWELL", "3124", "full"],
  ["CANTERBURY", "3126", "full"],
  ["DEEPDENE", "3103", "full"],
  ["GLEN IRIS", "3146", "part"],
  ["HAWTHORN", "3122", "full"],
  ["HAWTHORN EAST", "3123", "full"],
  ["KEW", "3101", "full"],
  ["KEW EAST", "3102", "full"],
  ["SURREY HILLS", "3127", "part"],
].map(([suburb, postcode, councilCoverage]) => ({ suburb, postcode, councilCoverage }));

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (value) => value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const registerPath = arg("--register");
if (!registerPath) {
  throw new Error("Usage: build-boroondara-planning-coverage.mjs --register <json>");
}

const register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
const retrievedAt = register.source?.retrievedAt;
if (!retrievedAt || !Array.isArray(register.records)) {
  throw new Error("Register metadata or records are missing");
}

function exactRows({ suburb, postcode }) {
  const pattern = new RegExp(`\\b${suburb}\\s+VIC\\s+${postcode}$`, "i");
  return register.records.filter((row) => pattern.test(row.location || ""));
}

function deduplicate(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.applicationNumber,
      row.location,
      row.description,
      row.receivedDate,
      row.registeredDate,
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizedRows(area, rows) {
  return rows.map((row) => ({
    applicationNumber: row.applicationNumber,
    description: row.description,
    location: row.location,
    lodgedDate: String(row.registeredDate || "").replace(
      /^(\d{4})\/(\d{2})\/(\d{2})$/,
      "$3/$2/$1",
    ),
    suburb: area.suburb,
    postcode: area.postcode,
  }));
}

function reviewedDwellingYield(description) {
  const value = String(description || "").toLowerCase();
  if (/\bwithdrawn\b/.test(value)) return null;
  const explicitProposal =
    /\b(?:new|second)\s+dwelling\b/.test(value)
    || /\bconstruct(?:ion)?\s+of\s+(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)(?:\s*\(\s*\d+\s*\))?\s+(?:[\w-]+\s+){0,3}dwellings?\b/.test(value)
    || /\b(?:containing|consisting of|accommodating)\s+(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)(?:\s*\(\s*\d+\s*\))?\s+(?:[\w-]+\s+){0,3}dwellings?\b/.test(value)
    || /\bconstruction of a dwelling\b/.test(value)
    || /\bconstruct a dwelling\b/.test(value);
  if (!explicitProposal) return null;
  const parsed = extractDwellingYield(description);
  return parsed.quality === "description_extracted" ? parsed.newDwellings : null;
}

function artifact(area, displayedRows, rows) {
  const normalized = normalizedRows(area, rows).map((row) => normalizePlanningApplication(row));
  const byBase = new Map();
  for (const row of normalized) {
    if (!byBase.has(row.baseApplicationNumber)) byBase.set(row.baseApplicationNumber, row);
  }
  const unique = [...byBase.values()];
  const reviewedYields = unique
    .map((row) => reviewedDwellingYield(row.description))
    .filter(Number.isFinite);
  const applicationNumbers = rows.map((row) => String(row.applicationNumber || "").trim().toUpperCase());
  const checks = {
    sourceDisplayedRows: displayedRows.length,
    exactDuplicateDisplayRowsRemoved: displayedRows.length - rows.length,
    canonicalRows: rows.length,
    missingApplicationNumber: rows.filter((row) => !row.applicationNumber).length,
    missingRegisteredDate: rows.filter((row) => !row.registeredDate).length,
    missingDescription: rows.filter((row) => !row.description).length,
    wrongGeography: 0,
    duplicateCanonicalApplicationNumbers: applicationNumbers.length - new Set(applicationNumbers).size,
    allCouncilCanonicalRowsAccountedFor: null,
    recordLevelReuse: "Internal validation only; public output is aggregate only",
  };
  if (
    !rows.length
    || checks.missingApplicationNumber
    || checks.missingRegisteredDate
    || checks.missingDescription
    || checks.duplicateCanonicalApplicationNumbers
  ) {
    throw new Error(`Publication gate failed for ${area.suburb}`);
  }
  return {
    schemaVersion: "planning-pipeline-summary-v1",
    source: {
      publisher: "City of Boroondara",
      url: REGISTER_SOURCE,
      retrievedAt,
      sourceReport: "Planning permit applications registered",
    },
    filters: {
      registeredStart: "01/01/2025",
      registeredEnd: "31/12/2025",
      suburb: area.suburb,
      postcode: area.postcode,
    },
    geography: {
      council: "City of Boroondara",
      councilCoverage: area.councilCoverage,
      note: area.councilCoverage === "part"
        ? `Only addresses in the City of Boroondara portion of ${title(area.suburb)}`
        : "Whole suburb is listed by City of Boroondara",
    },
    quality: checks,
    summary: {
      registeredApplicationCount: normalized.length,
      uniqueProjectCount: unique.length,
      quantifiedResidentialProjects: reviewedYields.length,
      statedProposedDwellings: reviewedYields.reduce((sum, value) => sum + value, 0),
      statusWeightedPipeline: null,
    },
    publication: {
      publishable: true,
      pagePublished: true,
      grain: `Aggregate applications registered in 2025 at exact ${title(area.suburb)} VIC ${area.postcode} addresses${area.councilCoverage === "part" ? " within City of Boroondara" : ""}`,
      statusReferenceDate: null,
      limitations: [
        "Application counts are not dwelling counts",
        "Dwelling quantities are included only when an explicit new-dwelling proposal and quantity are stated in the official description",
        "Stated proposed dwellings are gross proposals, not net additions; replacement dwellings, demolitions and completions are not inferred",
        "Registered applications can later be withdrawn, refused, amended or approved",
        "The annual registered-applications report does not expose a reliable current status for every row, so no status-weighted value is published",
        "Council warns that applications can take several days to appear and gives no warranty as to register accuracy",
        ...(area.councilCoverage === "part"
          ? ["The suburb crosses council boundaries; this summary covers only the City of Boroondara portion"]
          : []),
      ],
    },
  };
}

function planningMarkup(area, data) {
  const s = data.summary;
  const coverage = area.councilCoverage === "part" ? " · Boroondara-council portion only" : "";
  return `
<!-- AHV_PLANNING_PIPELINE_START -->
<style id="ahv-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta,.ahv-planning-card p{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}.ahv-planning-meta{font-size:.8rem}.ahv-planning-card p{font-size:.76rem;margin:7px 0 0}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-planning-heading">
  <h2 id="ahv-planning-heading">Planning pipeline</h2>
  <p class="ahv-planning-intro">City of Boroondara planning applications registered in 2025${coverage}. Applications are not building permits, commencements or completions.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Registered applications</div><div class="ahv-planning-value">${s.registeredApplicationCount}</div><div class="ahv-planning-meta">Exact suburb and postcode match</div><p>Duplicate report rows removed</p></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Unique projects</div><div class="ahv-planning-value">${s.uniqueProjectCount}</div><div class="ahv-planning-meta">Deduplicated by base application number</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated dwelling yield</div><div class="ahv-planning-value">${s.quantifiedResidentialProjects} projects</div><div class="ahv-planning-meta">Only explicit quantities</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated proposed dwellings</div><div class="ahv-planning-value">${s.statedProposedDwellings}</div><div class="ahv-planning-meta">Description-derived gross proposals</div><p>Not net additions or completed homes</p></article>
  </div>
  <p class="ahv-planning-meta">Current status is not shown because the annual register report does not provide a reliable current status for every application.</p>
</section>
<!-- AHV_PLANNING_PIPELINE_END -->
`;
}

function inject(area, data) {
  const page = path.join(ROOT, "public", "suburb", `${slug(area.suburb)}-vic.html`);
  let html = fs.existsSync(page)
    ? fs.readFileSync(page, "utf8")
    : planningOnlyPage(area);
  html = html.replace(
    /[\r\n]*<!-- AHV_PLANNING_PIPELINE_START -->[\s\S]*?<!-- AHV_PLANNING_PIPELINE_END -->[\r\n]*/g,
    "",
  );
  if (!html.includes("</body>")) throw new Error(`Missing body close in ${page}`);
  html = html.includes("<!-- AHV_PLANNING_INSERT -->")
    ? html.replace("<!-- AHV_PLANNING_INSERT -->", planningMarkup(area, data))
    : html.replace("</body>", `${planningMarkup(area, data)}</body>`);
  fs.writeFileSync(page, html);
  return true;
}

function planningOnlyPage(area) {
  const suburb = title(area.suburb);
  const canonical = `https://www.aushomevalue.com.au/suburb/${slug(area.suburb)}-vic.html`;
  const coverage = area.councilCoverage === "part" ? " · City of Boroondara portion only" : "";
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${suburb} VIC Planning Research | AusHomeValue</title>
  <meta name="description" content="Source-labelled City of Boroondara planning application data for ${suburb}, Victoria.">
  <link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow">
  <meta property="og:title" content="${suburb} Planning Research | AusHomeValue">
  <meta property="og:description" content="Verified planning-register evidence for ${suburb}, with source definitions and limitations.">
  <meta property="og:url" content="${canonical}"><meta property="og:type" content="website">
  <link rel="stylesheet" href="/shared-responsive.css">
  <style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:960px;margin:auto;padding:32px 20px 12px}.breadcrumb,.eyebrow,.notice{color:#66736d}.breadcrumb{font-size:.85rem;margin-bottom:20px}.breadcrumb a{color:#0d6b57}h1{font-size:clamp(1.8rem,5vw,2.7rem);line-height:1.15;margin:0 0 10px}.eyebrow{margin:0}.notice{max-width:920px;margin:0 auto 48px;padding:14px 16px;background:#e8f3ef;border-left:4px solid #0d6b57;border-radius:6px}.footer{border-top:1px solid #dbe2de;padding:24px;text-align:center;color:#66736d;font-size:.8rem}@media(max-width:560px){.container{padding:24px 14px 10px}.notice{margin:0 14px 36px}}</style>
</head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${suburb}</div>
  <h1>${suburb}, VIC — Planning Research</h1>
  <p class="eyebrow">Postcode ${area.postcode} · City of Boroondara${coverage} · Only verified, source-labelled metrics are shown.</p>
</main>
<!-- AHV_PLANNING_INSERT -->
<div class="notice"><strong>Data availability:</strong> this page currently publishes the verified council planning aggregate only. Other market metrics are omitted until an approved source and definition are available.</div>
<footer class="footer">© ${new Date().getFullYear()} AusHomeValue · Research information only, not financial advice.</footer></body></html>
`;
}

const totalCanonicalRows = deduplicate(register.records).length;
let accountedCanonicalRows = 0;
const summaries = [];
for (const area of AREAS) {
  const displayedRows = exactRows(area);
  const rows = deduplicate(displayedRows);
  accountedCanonicalRows += rows.length;
  const data = artifact(area, displayedRows, rows);
  const filename = `${slug(area.suburb)}-planning-pipeline-2025.json`;
  fs.writeFileSync(
    path.join(ROOT, "data", "validation", filename),
    `${JSON.stringify(data, null, 2)}\n`,
  );
  const pagePublished = inject(area, data);
  summaries.push({ suburb: area.suburb, pagePublished, ...data.summary });
}

if (accountedCanonicalRows !== totalCanonicalRows) {
  throw new Error(
    `Council coverage mismatch: accounted for ${accountedCanonicalRows} of ${totalCanonicalRows} canonical rows`,
  );
}

for (const area of AREAS) {
  const filename = path.join(
    ROOT,
    "data",
    "validation",
    `${slug(area.suburb)}-planning-pipeline-2025.json`,
  );
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  data.quality.allCouncilCanonicalRowsAccountedFor = totalCanonicalRows;
  fs.writeFileSync(filename, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(JSON.stringify({
  sourceDisplayedRows: register.records.length,
  canonicalRows: totalCanonicalRows,
  areas: summaries,
}, null, 2));
