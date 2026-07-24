#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregatePlanningPipeline } from "../lib/planning-application-normalizer.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGISTER_SOURCE = "https://epathway.monash.vic.gov.au/ePathway/ePTHPROD/Web/GeneralEnquiry/EnquiryLists.aspx";
const SCHEDULE_SOURCE = "https://www.monash.vic.gov.au/files/assets/public/v/1/about-us/council/agendas/2025/16-december/7.1.1-town-planning-schedule.pdf";
const FINALIZED = new Set(["MOUNT WAVERLEY", "OAKLEIGH"]);
const AREAS = [
  ["ASHWOOD", "3147", "full"], ["BURWOOD", "3125", "part"],
  ["CHADSTONE", "3148", "part"], ["CLAYTON", "3168", "full"],
  ["GLEN WAVERLEY", "3150", "full"], ["HUGHESDALE", "3166", "full"],
  ["HUNTINGDALE", "3166", "full"], ["MOUNT WAVERLEY", "3149", "full"],
  ["MULGRAVE", "3170", "full"], ["NOTTING HILL", "3168", "full"],
  ["OAKLEIGH", "3166", "full"], ["OAKLEIGH EAST", "3166", "full"],
  ["OAKLEIGH SOUTH", "3167", "part"], ["WHEELERS HILL", "3150", "full"],
].map(([suburb, postcode, councilCoverage]) => ({ suburb, postcode, councilCoverage }));

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const title = (value) => value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const registerPath = arg("--register");
const scheduleTextPath = arg("--schedule-text");
if (!registerPath || !scheduleTextPath) {
  throw new Error("Usage: build-monash-planning-coverage.mjs --register <json> --schedule-text <txt>");
}

const register = JSON.parse(fs.readFileSync(registerPath, "utf8"));
const scheduleText = fs.readFileSync(scheduleTextPath, "utf8");
const retrievedAt = register.source?.retrievedAt;
if (!retrievedAt || register.quality?.sourceRows !== register.records?.length) {
  throw new Error("Register metadata or row count is inconsistent");
}

function exactRows({ suburb, postcode }) {
  const pattern = new RegExp(`\\b${suburb}\\s+VIC\\s+${postcode}$`, "i");
  return register.records.filter((row) => pattern.test(row.location || ""))
    .map((row) => ({ ...row, suburb, postcode }));
}

function quality(rows) {
  const applications = rows.map((row) => String(row.applicationNumber || "").trim().toUpperCase());
  return {
    pageCount: register.quality.pageCount,
    sourceRows: register.quality.sourceRows,
    exactGeographyRows: rows.length,
    missingApplicationNumber: rows.filter((row) => !row.applicationNumber).length,
    missingLodgedDate: rows.filter((row) => !row.lodgedDate).length,
    missingDescription: rows.filter((row) => !row.description).length,
    wrongGeography: 0,
    duplicateExactApplicationNumbers: applications.length - new Set(applications).size,
    decemberScheduleApplicationCrossCheckCount: applications.filter((number) => scheduleText.includes(number)).length,
    decemberScheduleCrossCheckScope: "Application-number existence only; register remains the record source",
    excludedUnparseableRegisterRows: register.records.length - AREAS.reduce((sum, area) => sum + exactRows(area).length, 0),
    recordLevelReuse: "Internal validation only; public output is aggregate only",
  };
}

function artifact(area, rows) {
  const aggregate = aggregatePlanningPipeline(rows, area);
  const checks = quality(rows);
  if (!rows.length || checks.missingApplicationNumber || checks.missingLodgedDate
    || checks.missingDescription || checks.duplicateExactApplicationNumbers
    || checks.decemberScheduleApplicationCrossCheckCount < 1) {
    throw new Error(`Publication gate failed for ${area.suburb}`);
  }
  return {
    schemaVersion: "planning-pipeline-summary-v1",
    source: {
      publisher: "City of Monash", url: REGISTER_SOURCE, retrievedAt,
      crossCheck: "City of Monash December 2025 Town Planning Schedule",
      crossCheckUrl: SCHEDULE_SOURCE,
    },
    filters: { lodgedStart: "01/01/2025", lodgedEnd: "31/12/2025", suburb: area.suburb, postcode: area.postcode },
    geography: {
      council: "City of Monash", councilCoverage: area.councilCoverage,
      note: area.councilCoverage === "part" ? `Only addresses in the City of Monash portion of ${title(area.suburb)}` : "Whole suburb is listed by City of Monash",
    },
    quality: checks,
    summary: {
      rawApplicationCount: aggregate.rawApplicationCount,
      uniqueProjectCount: aggregate.uniqueProjectCount,
      amendmentCount: aggregate.amendmentCount,
      quantifiedResidentialProjects: aggregate.quantifiedResidentialProjects,
      grossProposedDwellings: aggregate.grossProposedDwellings,
      netProposedDwellings: aggregate.netProposedDwellings,
      weightedNetPipeline: Number(aggregate.weightedNetPipeline.toFixed(2)),
      unresolvedResidentialProjects: aggregate.unresolvedResidentialProjects,
    },
    publication: {
      publishable: true,
      grain: `Aggregate counts for applications lodged in 2025 at exact ${title(area.suburb)} VIC ${area.postcode} addresses${area.councilCoverage === "part" ? " within City of Monash" : ""}`,
      statusReferenceDate: retrievedAt.slice(0, 10),
      limitations: [
        "Application counts are not dwelling counts",
        "Dwelling quantities are included only when explicitly stated in the official description",
        "Status-weighted pipeline is a model indicator, not a count of commenced or completed homes",
        "Current statuses can change after retrieval",
        ...(area.councilCoverage === "part" ? ["The suburb crosses council boundaries; this summary covers only the City of Monash portion"] : []),
      ],
    },
  };
}

function planningMarkup(area, data) {
  const s = data.summary;
  const coverage = area.councilCoverage === "part" ? " · Monash-council portion only" : "";
  return `\n<!-- AHV_PLANNING_PIPELINE_START -->
<style id="ahv-planning-style">.ahv-planning{max-width:960px;margin:36px auto;padding:0 20px 36px;color:#17211d}.ahv-planning h2{font-size:1.35rem;margin:0 0 6px}.ahv-planning-intro,.ahv-planning-meta,.ahv-planning-card p{color:#66736d}.ahv-planning-intro{margin:0 0 16px}.ahv-planning-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px}.ahv-planning-card{background:#fff;border:1px solid #dbe2de;border-radius:10px;padding:16px}.ahv-planning-label{font-size:.76rem;text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-weight:700}.ahv-planning-value{font-size:1.4rem;font-weight:800;margin:5px 0}.ahv-planning-meta{font-size:.8rem}.ahv-planning-card p{font-size:.76rem;margin:7px 0 0}@media(max-width:560px){.ahv-planning{padding:0 14px 30px}.ahv-planning-grid{grid-template-columns:1fr}}</style>
<section class="ahv-planning" aria-labelledby="ahv-planning-heading">
  <h2 id="ahv-planning-heading">Planning pipeline</h2>
  <p class="ahv-planning-intro">City of Monash planning applications lodged in 2025${coverage}. Applications are not building permits, commencements or completions.</p>
  <div class="ahv-planning-grid">
    <article class="ahv-planning-card"><div class="ahv-planning-label">Register records</div><div class="ahv-planning-value">${s.rawApplicationCount}</div><div class="ahv-planning-meta">Exact suburb and postcode match</div><p>Includes amendments and repeat project records</p></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Unique projects</div><div class="ahv-planning-value">${s.uniqueProjectCount}</div><div class="ahv-planning-meta">Deduplicated by base application number</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Stated dwelling yield</div><div class="ahv-planning-value">${s.quantifiedResidentialProjects} projects</div><div class="ahv-planning-meta">Only explicit quantities</div></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Proposed dwellings</div><div class="ahv-planning-value">${s.netProposedDwellings}</div><div class="ahv-planning-meta">Description-derived</div><p>Proposed supply, not completed homes</p></article>
    <article class="ahv-planning-card"><div class="ahv-planning-label">Status-weighted pipeline</div><div class="ahv-planning-value">${s.weightedNetPipeline.toFixed(1)}</div><div class="ahv-planning-meta">Status checked ${data.publication.statusReferenceDate}</div><p>AusHomeValue model indicator, not a physical dwelling count</p></article>
  </div>
</section>
<!-- AHV_PLANNING_PIPELINE_END -->\n`;
}

function inject(area, data) {
  const page = path.join(ROOT, "public", "suburb", `${slug(area.suburb)}-vic.html`);
  if (!fs.existsSync(page)) throw new Error(`Missing public page: ${page}`);
  let html = fs.readFileSync(page, "utf8");
  html = html.replace(/[\r\n]*<!-- AHV_PLANNING_PIPELINE_START -->[\s\S]*?<!-- AHV_PLANNING_PIPELINE_END -->[\r\n]*/g, "");
  if (!html.includes("</body>")) throw new Error(`Missing body close in ${page}`);
  html = html.replace("</body>", `${planningMarkup(area, data)}</body>`);
  fs.writeFileSync(page, html);
}

const summaries = [];
for (const area of AREAS) {
  const rows = exactRows(area);
  const data = artifact(area, rows);
  summaries.push({ suburb: area.suburb, ...data.summary, crossChecks: data.quality.decemberScheduleApplicationCrossCheckCount });
  if (FINALIZED.has(area.suburb)) continue;
  const filename = `${slug(area.suburb)}-planning-pipeline-2025.json`;
  fs.writeFileSync(path.join(ROOT, "data", "validation", filename), `${JSON.stringify(data, null, 2)}\n`);
  inject(area, data);
}

console.log(JSON.stringify({ sourceRows: register.records.length, areas: summaries }, null, 2));
