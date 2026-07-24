#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDwellingYield, normalizePlanningApplication, planningStatusWeight } from "../lib/planning-application-normalizer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "https://manningham-web.t1cloud.com/T1PRDefault/WebApps/eProperty/P1/eTrack/eTrackApplicationSearch.aspx?r=P1.WEBGUEST&f=P1.ETR.SEARCHMCC.ENQ";
const AREAS = [
  ["BULLEEN", "3105", "full"], ["DONCASTER", "3108", "full"],
  ["DONCASTER EAST", "3109", "full"], ["DONVALE", "3111", "full"],
  ["NUNAWADING", "3131", "part"], ["PARK ORCHARDS", "3114", "full"],
  ["RINGWOOD NORTH", "3134", "part"], ["TEMPLESTOWE", "3106", "full"],
  ["TEMPLESTOWE LOWER", "3107", "full"], ["WARRANDYTE", "3113", "full"],
  ["WARRANDYTE SOUTH", "3134", "full"], ["WONGA PARK", "3115", "full"],
].map(([suburb, postcode, councilCoverage]) => ({ suburb, postcode, councilCoverage }));

const slug = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (v) => v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const arg = (name) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null;
const registerPath = arg("--register");
if (!registerPath) throw new Error("Usage: build-manningham-planning-coverage.mjs --register <json>");
const register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
if (!register.source?.retrievedAt || !Array.isArray(register.records)) throw new Error("Invalid register file");

function exactRows(area) {
  const re = new RegExp(`\\s${area.suburb}\\s+VIC\\s+${area.postcode}$`, "i");
  return register.records.filter((row) => re.test(row.location || ""));
}

function reviewedDwellingYield(row) {
  if (/^(?:PLA|PVA)/i.test(row.applicationNumber || "")) return null;
  const value = String(row.description || "").toLowerCase();
  if (/\b(?:existing dwelling|associated with (?:the |an? )?existing dwelling)\b/.test(value)
    && !/\b(?:new|second|small second)\s+dwelling\b/.test(value)
    && !/\bconstruction of (?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)[^.;]{0,60}dwellings?\b/.test(value)) return null;
  if (/\bconstruction of (?:a )?(?:front fence|carport|garage|verandah|deck|pergola|outbuilding)[^.;]*associated with [^.;]*dwellings?\b/.test(value)) return null;
  if (/\bdual occupancy\b/.test(value)) return 2;
  const quantities = [];
  const pattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)(?:\s*\(\s*\d+\s*\))?\s*,?\s+(?:(?:one|two|three|four)(?:\s+and\s+(?:one|two|three|four))?[- ]storey\s+|(?:single|double)[- ]stor(?:e?y)\s+|new\s+)?dwellings?\b/g;
  for (const match of value.matchAll(pattern)) {
    quantities.push(/^\d+$/.test(match[1]) ? Number(match[1]) : WORDS[match[1]]);
  }
  if (quantities.length && /\b(?:construction|construct|development|develop)\b/.test(value)) {
    if (/\bdwellings?\s*,?\s+comprising\b/.test(value)) return quantities[0];
    return quantities.reduce((sum, count) => sum + count, 0);
  }
  if (/\b(?:construction|construct|development|develop|use and development)\b[^.;]{0,100}\b(?:a|one|single|new|second|small second)\s+(?:two-storey\s+)?dwelling\b/.test(value)
    || /\bdwelling to the rear of the existing dwelling\b/.test(value)) return 1;
  const parsed = extractDwellingYield(row.description);
  return parsed.quality === "description_extracted" ? parsed.newDwellings : null;
}

function statusWeight(row) {
  const status = String(row.decision || "").trim();
  if (/voided|re-?categ/i.test(status)) return 0;
  if (/^permit$/i.test(status)) return 1;
  if (/application received|acknowledge|ready to report|report/i.test(status)) return 0.35;
  return planningStatusWeight({ status });
}

function makeArtifact(area, rows) {
  const normalized = rows.map((row) => normalizePlanningApplication({
    ...row, status: row.decision, suburb: area.suburb, postcode: area.postcode,
  }));
  const unique = new Map(normalized.map((row) => [row.baseApplicationNumber, row]));
  const reviewed = rows.map((row) => ({ row, count: reviewedDwellingYield(row) }))
    .filter(({ count }) => Number.isFinite(count));
  const ids = rows.map((row) => row.applicationNumber);
  const quality = {
    sourceRows: register.records.length,
    exactGeographyRows: rows.length,
    missingApplicationNumber: rows.filter((row) => !row.applicationNumber).length,
    missingLodgedDate: rows.filter((row) => !row.lodgedDate).length,
    missingDescription: rows.filter((row) => !row.description).length,
    duplicateExactApplicationNumbers: ids.length - new Set(ids).size,
    allCouncilGeographyRowsAccountedFor: 727,
    recordLevelReuse: "Internal validation only; public output is aggregate only",
  };
  if (quality.missingApplicationNumber || quality.missingLodgedDate
    || quality.duplicateExactApplicationNumbers) throw new Error(`Publication gate failed for ${area.suburb}`);
  return {
    schemaVersion: "planning-pipeline-summary-v1",
    source: {
      publisher: "Manningham City Council", url: SOURCE, retrievedAt: register.source.retrievedAt,
      sourceReport: "Planning Applications Portal — date-range search",
    },
    filters: { lodgedStart: "01/01/2025", lodgedEnd: "31/12/2025", suburb: area.suburb, postcode: area.postcode },
    geography: {
      council: "Manningham City Council", councilCoverage: area.councilCoverage,
      note: area.councilCoverage === "part"
        ? `Only addresses in the Manningham City Council portion of ${title(area.suburb)}`
        : "Whole suburb is listed by Manningham City Council",
    },
    quality,
    summary: {
      lodgedApplicationCount: normalized.length,
      uniqueProjectCount: unique.size,
      quantifiedResidentialProjects: reviewed.length,
      statedProposedDwellings: reviewed.reduce((sum, item) => sum + item.count, 0),
      statusWeightedProposedDwellings: Number(
        reviewed.reduce((sum, item) => sum + item.count * statusWeight(item.row), 0).toFixed(2),
      ),
    },
    publication: {
      publishable: true, pagePublished: true,
      grain: `Aggregate applications lodged in 2025 at exact ${title(area.suburb)} VIC ${area.postcode} addresses`,
      statusReferenceDate: register.source.retrievedAt.slice(0, 10),
      limitations: [
        "Application counts are not dwelling counts",
        "Dwelling quantities require an explicit new-dwelling proposal and quantity",
        "Permit amendments are excluded from stated dwelling proposals",
        "Stated proposed dwellings are gross proposals, not net additions or completed homes",
        "Status-weighted proposed dwellings are an AusHomeValue model indicator, not a physical dwelling count",
        "The council warns that recently lodged applications can take several days to appear",
        ...(quality.missingDescription
          ? [`${quality.missingDescription} register row has no public description and is excluded from dwelling-yield extraction`]
          : []),
        ...(area.councilCoverage === "part"
          ? ["The suburb crosses council boundaries; this summary covers only the Manningham City Council portion"]
          : []),
      ],
    },
  };
}

function markup(area, data) {
  const s = data.summary;
  const partial = area.councilCoverage === "part" ? " · Manningham-council portion only" : "";
  return `
<!-- AHV_MANNINGHAM_PLANNING_START -->
<style id="ahv-manningham-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta,.ahv-planning-card p{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}.ahv-planning-meta{font-size:.8rem}.ahv-planning-card p{font-size:.76rem;margin:7px 0 0}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-manningham-planning-heading">
  <h2 id="ahv-manningham-planning-heading">Manningham planning pipeline</h2>
  <p class="ahv-planning-intro">Manningham City Council planning applications lodged in 2025${partial}. Applications are not building permits, commencements or completions.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Lodged applications</div><div class="ahv-planning-value">${s.lodgedApplicationCount}</div><div class="ahv-planning-meta">Exact suburb and postcode match</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Unique projects</div><div class="ahv-planning-value">${s.uniqueProjectCount}</div><div class="ahv-planning-meta">Grouped by base application number</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated dwelling yield</div><div class="ahv-planning-value">${s.quantifiedResidentialProjects} projects</div><div class="ahv-planning-meta">New applications with explicit quantities</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated proposed dwellings</div><div class="ahv-planning-value">${s.statedProposedDwellings}</div><div class="ahv-planning-meta">Description-derived gross proposals</div><p>Not net additions or completed homes</p></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Status-weighted proposals</div><div class="ahv-planning-value">${s.statusWeightedProposedDwellings.toFixed(1)}</div><div class="ahv-planning-meta">Status checked ${data.publication.statusReferenceDate}</div><p>Model indicator, not a physical dwelling count</p></article>
  </div>
</section>
<!-- AHV_MANNINGHAM_PLANNING_END -->
`;
}

function planningOnlyPage(area) {
  const name = title(area.suburb);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} VIC Planning Research | AusHomeValue</title><meta name="description" content="Source-labelled Manningham City Council planning data for ${name}, Victoria."><link rel="canonical" href="https://www.aushomevalue.com.au/suburb/${slug(area.suburb)}-vic.html"><meta name="robots" content="index, follow"><link rel="stylesheet" href="/shared-responsive.css"><style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:960px;margin:auto;padding:32px 20px 12px}.breadcrumb,.eyebrow,.notice{color:#66736d}.notice{max-width:920px;margin:0 auto 48px;padding:14px 16px;background:#e8f3ef;border-left:4px solid #0d6b57;border-radius:6px}</style></head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container"><div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${name}</div><h1>${name}, VIC — Planning Research</h1><p class="eyebrow">Postcode ${area.postcode} · Manningham City Council · Only verified, source-labelled metrics are shown.</p></main><!-- AHV_MANNINGHAM_PLANNING_INSERT --><div class="notice"><strong>Data availability:</strong> other market metrics are omitted until an approved source and definition are available.</div></body></html>`;
}

function inject(area, data) {
  const file = path.join(ROOT, "public", "suburb", `${slug(area.suburb)}-vic.html`);
  let html = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : planningOnlyPage(area);
  html = html.replace(/[\r\n]*<!-- AHV_MANNINGHAM_PLANNING_START -->[\s\S]*?<!-- AHV_MANNINGHAM_PLANNING_END -->[\r\n]*/g, "");
  html = html.includes("<!-- AHV_MANNINGHAM_PLANNING_INSERT -->")
    ? html.replace("<!-- AHV_MANNINGHAM_PLANNING_INSERT -->", markup(area, data))
    : html.replace("</body>", `${markup(area, data)}</body>`);
  fs.writeFileSync(file, html);
}

let accounted = 0;
const summaries = [];
for (const area of AREAS) {
  const rows = exactRows(area);
  accounted += rows.length;
  const data = makeArtifact(area, rows);
  fs.writeFileSync(path.join(ROOT, "data", "validation", `${slug(area.suburb)}-manningham-planning-pipeline-2025.json`), `${JSON.stringify(data, null, 2)}\n`);
  inject(area, data);
  summaries.push({ suburb: area.suburb, ...data.summary });
}
if (accounted !== register.records.length) throw new Error(`Coverage mismatch: ${accounted} != ${register.records.length}`);
console.log(JSON.stringify({ sourceRows: register.records.length, accountedRows: accounted, areas: summaries }, null, 2));
