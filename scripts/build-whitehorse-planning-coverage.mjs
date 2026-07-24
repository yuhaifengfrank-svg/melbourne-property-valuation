#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractDwellingYield,
  normalizePlanningApplication,
  planningStatusWeight,
} from "../lib/planning-application-normalizer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER_SOURCE = "https://eservices.whitehorse.vic.gov.au/ePathway/Production/Web/GeneralEnquiry/ExternalRequestBroker.aspx?Class=WH&Module=EGELAP&Type=WH";
const AREAS = [
  ["BALWYN NORTH", "3104", "part"],
  ["BLACKBURN", "3130", "full"],
  ["BLACKBURN NORTH", "3130", "full"],
  ["BLACKBURN SOUTH", "3130", "full"],
  ["BOX HILL", "3128", "full"],
  ["BOX HILL NORTH", "3129", "full"],
  ["BOX HILL SOUTH", "3128", "full"],
  ["BURWOOD", "3125", "part"],
  ["BURWOOD EAST", "3151", "full"],
  ["FOREST HILL", "3131", "full"],
  ["MITCHAM", "3132", "full"],
  ["MONT ALBERT", "3127", "part"],
  ["MONT ALBERT NORTH", "3129", "full"],
  ["NUNAWADING", "3131", "part"],
  ["SURREY HILLS", "3127", "part"],
  ["VERMONT", "3133", "part"],
  ["VERMONT SOUTH", "3133", "full"],
].map(([suburb, postcode, councilCoverage]) => ({ suburb, postcode, councilCoverage }));

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (value) => value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const registerPath = arg("--register");
if (!registerPath) throw new Error("Usage: build-whitehorse-planning-coverage.mjs --register <json>");

const register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
const retrievedAt = register.source?.retrievedAt;
if (!retrievedAt || !Array.isArray(register.records)) {
  throw new Error("Register metadata or records are missing");
}

function exactRows({ suburb, postcode }) {
  const pattern = new RegExp(`,\\s*${suburb}\\s+VIC\\s+${postcode}$`, "i");
  return register.records.filter((row) => pattern.test(row.location || ""));
}

function reviewedDwellingYield(row) {
  if (/amendment/i.test(row.applicationType || "") || /\/[A-Z]$/i.test(row.applicationNumber || "")) {
    return null;
  }
  const value = String(row.description || "").toLowerCase();
  const explicitProposal =
    /\b(?:new|second)\s+dwelling\b/.test(value)
    || /\bconstruct(?:ion)?\s+of\s+(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)(?:\s*\(\s*\d+\s*\))?\s+(?:[\w-]+\s+){0,4}dwellings?\b/.test(value)
    || /\b(?:containing|consisting of|accommodating)\s+(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)(?:\s*\(\s*\d+\s*\))?\s+(?:[\w-]+\s+){0,4}dwellings?\b/.test(value)
    || /\bconstruction of a dwelling\b/.test(value)
    || /\bconstruct a dwelling\b/.test(value)
    || /\bdual occupancy\b/.test(value);
  if (!explicitProposal) return null;
  if (/\bdual occupancy\b/.test(value)) return 2;
  const parsed = extractDwellingYield(row.description);
  return parsed.quality === "description_extracted" ? parsed.newDwellings : null;
}

function statusWeight(row) {
  const decision = String(row.decision || "");
  if (!decision) return planningStatusWeight({ status: "Under assessment" });
  if (/\bNOD\b/i.test(decision)) return 0.8;
  return planningStatusWeight({ decision });
}

function artifact(area, rows) {
  const normalized = rows.map((row) => normalizePlanningApplication({
    ...row,
    status: row.decision ? null : "Under assessment",
    suburb: area.suburb,
    postcode: area.postcode,
  }));
  const byBase = new Map();
  for (const row of normalized) {
    if (!byBase.has(row.baseApplicationNumber)) byBase.set(row.baseApplicationNumber, row);
  }
  const unique = [...byBase.values()];
  const reviewed = rows
    .map((row) => ({ row, count: reviewedDwellingYield(row) }))
    .filter(({ count }) => Number.isFinite(count));
  const applicationNumbers = rows.map((row) => String(row.applicationNumber || "").trim().toUpperCase());
  const quality = {
    sourceRows: register.records.length,
    excludedDummyRows: register.records.filter((row) => /,\s*DUMMY VIC 9999$/i.test(row.location || "")).length,
    excludedMissingLocationRows: register.records.filter((row) => !row.location).length,
    exactGeographyRows: rows.length,
    missingApplicationNumber: rows.filter((row) => !row.applicationNumber).length,
    missingLodgedDate: rows.filter((row) => !row.lodgedDate).length,
    missingDescription: rows.filter((row) => !row.description).length,
    wrongGeography: 0,
    duplicateExactApplicationNumbers: applicationNumbers.length - new Set(applicationNumbers).size,
    allCouncilGeographyRowsAccountedFor: null,
    recordLevelReuse: "Internal validation only; public output is aggregate only",
  };
  if (
    !rows.length
    || quality.missingApplicationNumber
    || quality.missingLodgedDate
    || quality.missingDescription
    || quality.duplicateExactApplicationNumbers
  ) {
    throw new Error(`Publication gate failed for ${area.suburb}`);
  }
  return {
    schemaVersion: "planning-pipeline-summary-v1",
    source: {
      publisher: "Whitehorse City Council",
      url: REGISTER_SOURCE,
      retrievedAt,
      sourceReport: "Planning Register — search by lodgement date",
    },
    filters: {
      lodgedStart: "01/01/2025",
      lodgedEnd: "31/12/2025",
      suburb: area.suburb,
      postcode: area.postcode,
    },
    geography: {
      council: "Whitehorse City Council",
      councilCoverage: area.councilCoverage,
      note: area.councilCoverage === "part"
        ? `Only addresses in the Whitehorse City Council portion of ${title(area.suburb)}`
        : "Whole suburb is listed by Whitehorse City Council",
    },
    quality,
    summary: {
      lodgedApplicationCount: normalized.length,
      uniqueProjectCount: unique.length,
      quantifiedResidentialProjects: reviewed.length,
      statedProposedDwellings: reviewed.reduce((sum, item) => sum + item.count, 0),
      statusWeightedProposedDwellings: Number(
        reviewed.reduce((sum, item) => sum + item.count * statusWeight(item.row), 0).toFixed(2),
      ),
    },
    publication: {
      publishable: true,
      pagePublished: true,
      grain: `Aggregate applications lodged in 2025 at exact ${title(area.suburb)} VIC ${area.postcode} addresses${area.councilCoverage === "part" ? " within Whitehorse City Council" : ""}`,
      statusReferenceDate: retrievedAt.slice(0, 10),
      limitations: [
        "Application counts are not dwelling counts",
        "Dwelling quantities are included only when a new 2025 application explicitly states a new-dwelling proposal and quantity",
        "Permit amendments are excluded from stated dwelling proposals to avoid recounting previously approved projects",
        "Stated proposed dwellings are gross proposals, not net additions; replacement dwellings, demolitions and completions are not inferred",
        "Status-weighted proposed dwellings are an AusHomeValue model indicator, not a physical dwelling count",
        "Current decisions can change after retrieval",
        ...(area.councilCoverage === "part"
          ? ["The suburb crosses council boundaries; this summary covers only the Whitehorse City Council portion"]
          : []),
      ],
    },
  };
}

function planningMarkup(area, data) {
  const s = data.summary;
  const coverage = area.councilCoverage === "part" ? " · Whitehorse-council portion only" : "";
  return `
<!-- AHV_WHITEHORSE_PLANNING_START -->
<style id="ahv-whitehorse-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta,.ahv-planning-card p{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}.ahv-planning-meta{font-size:.8rem}.ahv-planning-card p{font-size:.76rem;margin:7px 0 0}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-whitehorse-planning-heading">
  <h2 id="ahv-whitehorse-planning-heading">Whitehorse planning pipeline</h2>
  <p class="ahv-planning-intro">Whitehorse City Council planning applications lodged in 2025${coverage}. Applications are not building permits, commencements or completions.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Lodged applications</div><div class="ahv-planning-value">${s.lodgedApplicationCount}</div><div class="ahv-planning-meta">Exact suburb and postcode match</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Unique projects</div><div class="ahv-planning-value">${s.uniqueProjectCount}</div><div class="ahv-planning-meta">Grouped by base application number</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated dwelling yield</div><div class="ahv-planning-value">${s.quantifiedResidentialProjects} projects</div><div class="ahv-planning-meta">New applications with explicit quantities</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated proposed dwellings</div><div class="ahv-planning-value">${s.statedProposedDwellings}</div><div class="ahv-planning-meta">Description-derived gross proposals</div><p>Not net additions or completed homes</p></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Status-weighted proposals</div><div class="ahv-planning-value">${s.statusWeightedProposedDwellings.toFixed(1)}</div><div class="ahv-planning-meta">Decision status checked ${data.publication.statusReferenceDate}</div><p>Model indicator, not a physical dwelling count</p></article>
  </div>
</section>
<!-- AHV_WHITEHORSE_PLANNING_END -->
`;
}

function planningOnlyPage(area) {
  const suburb = title(area.suburb);
  const canonical = `https://www.aushomevalue.com.au/suburb/${slug(area.suburb)}-vic.html`;
  const coverage = area.councilCoverage === "part" ? " · Whitehorse City Council portion only" : "";
  return `<!DOCTYPE html>
<html lang="en"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${suburb} VIC Planning Research | AusHomeValue</title>
  <meta name="description" content="Source-labelled Whitehorse City Council planning application data for ${suburb}, Victoria.">
  <link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow">
  <link rel="stylesheet" href="/shared-responsive.css">
  <style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:960px;margin:auto;padding:32px 20px 12px}.breadcrumb,.eyebrow,.notice{color:#66736d}.breadcrumb{font-size:.85rem;margin-bottom:20px}.breadcrumb a{color:#0d6b57}h1{font-size:clamp(1.8rem,5vw,2.7rem);line-height:1.15;margin:0 0 10px}.notice{max-width:920px;margin:0 auto 48px;padding:14px 16px;background:#e8f3ef;border-left:4px solid #0d6b57;border-radius:6px}.footer{border-top:1px solid #dbe2de;padding:24px;text-align:center;color:#66736d;font-size:.8rem}@media(max-width:560px){.container{padding:24px 14px 10px}.notice{margin:0 14px 36px}}</style>
</head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${suburb}</div>
  <h1>${suburb}, VIC — Planning Research</h1>
  <p class="eyebrow">Postcode ${area.postcode} · Whitehorse City Council${coverage} · Only verified, source-labelled metrics are shown.</p>
</main>
<!-- AHV_WHITEHORSE_PLANNING_INSERT -->
<div class="notice"><strong>Data availability:</strong> this page currently publishes the verified council planning aggregate only. Other market metrics are omitted until an approved source and definition are available.</div>
<footer class="footer">© ${new Date().getFullYear()} AusHomeValue · Research information only, not financial advice.</footer></body></html>
`;
}

function inject(area, data) {
  const page = path.join(ROOT, "public", "suburb", `${slug(area.suburb)}-vic.html`);
  let html = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : planningOnlyPage(area);
  html = html.replace(
    /[\r\n]*<!-- AHV_WHITEHORSE_PLANNING_START -->[\s\S]*?<!-- AHV_WHITEHORSE_PLANNING_END -->[\r\n]*/g,
    "",
  );
  if (!html.includes("</body>")) throw new Error(`Missing body close in ${page}`);
  html = html.includes("<!-- AHV_WHITEHORSE_PLANNING_INSERT -->")
    ? html.replace("<!-- AHV_WHITEHORSE_PLANNING_INSERT -->", planningMarkup(area, data))
    : html.replace("</body>", `${planningMarkup(area, data)}</body>`);
  fs.writeFileSync(page, html);
}

let accountedRows = 0;
const summaries = [];
for (const area of AREAS) {
  const rows = exactRows(area);
  accountedRows += rows.length;
  const data = artifact(area, rows);
  fs.writeFileSync(
    path.join(ROOT, "data", "validation", `${slug(area.suburb)}-whitehorse-planning-pipeline-2025.json`),
    `${JSON.stringify(data, null, 2)}\n`,
  );
  inject(area, data);
  summaries.push({ suburb: area.suburb, ...data.summary });
}

const excludedRows = register.records.filter(
  (row) => /,\s*DUMMY VIC 9999$/i.test(row.location || "") || !row.location,
).length;
if (accountedRows + excludedRows !== register.records.length) {
  throw new Error(
    `Council coverage mismatch: ${accountedRows} accounted + ${excludedRows} excluded != ${register.records.length}`,
  );
}

for (const area of AREAS) {
  const filename = path.join(
    ROOT,
    "data",
    "validation",
    `${slug(area.suburb)}-whitehorse-planning-pipeline-2025.json`,
  );
  const data = JSON.parse(fs.readFileSync(filename, "utf8"));
  data.quality.allCouncilGeographyRowsAccountedFor = accountedRows;
  fs.writeFileSync(filename, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(JSON.stringify({
  sourceRows: register.records.length,
  accountedRows,
  excludedRows,
  areas: summaries,
}, null, 2));
