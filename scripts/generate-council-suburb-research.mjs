#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateValidatedPages } from "./generate-validated-suburb-pages.mjs";
import { marketSnapshotPanel } from "./suburb-market-panel.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VALIDATION_DIR = path.join(ROOT, "data", "validation");
const OUTPUT_DIR = path.join(ROOT, "public", "suburb");
const INDEX_PATH = path.join(ROOT, "public", "suburb-research.html");

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const slugify = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const titleCase = (value) => String(value).toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
const number = (value, digits = 0) => new Intl.NumberFormat("en-AU", { maximumFractionDigits: digits }).format(value);

function metricCard(label, value, meta, note) {
  return `<article class="metric-card"><div class="metric-label">${escapeHtml(label)}</div><div class="metric-value">${escapeHtml(value)}</div><div class="metric-meta">${escapeHtml(meta)}</div>${note ? `<p>${escapeHtml(note)}</p>` : ""}</article>`;
}

function planningArtifacts() {
  const artifacts = [];
  for (const filename of fs.readdirSync(VALIDATION_DIR)) {
    if (!filename.endsWith(".json")) continue;
    let artifact;
    try {
      artifact = JSON.parse(fs.readFileSync(path.join(VALIDATION_DIR, filename), "utf8"));
    } catch {
      continue;
    }
    if (![
      "planning-pipeline-summary-v1",
      "planning-context-summary-v1",
      "development-activity-summary-v1",
    ].includes(artifact.schemaVersion)) continue;
    if (artifact.publication?.publishable !== true) continue;
    const suburb = artifact.filters?.suburb || artifact.geography?.suburb;
    const council = artifact.geography?.council;
    if (!suburb || !council) continue;
    artifacts.push({
      ...artifact,
      _filename: filename,
      _suburb: titleCase(suburb),
      _postcode: String(artifact.filters?.postcode || artifact.geography?.postcode || ""),
      _council: council,
    });
  }
  return artifacts;
}

function pipelineCards(artifact) {
  const summary = artifact.summary || {};
  const period = "Applications lodged in 2025";
  const cards = [];
  const applicationCount = summary.rawApplicationCount ?? summary.lodgedApplicationCount ?? summary.registeredApplicationCount;
  if (Number.isFinite(applicationCount)) cards.push(metricCard("Planning application records", number(applicationCount), period, "Application records are not dwelling counts, approvals, commencements or completions."));
  if (Number.isFinite(summary.uniqueProjectCount)) cards.push(metricCard("Unique planning projects", number(summary.uniqueProjectCount), period, "Deduplicated project count using the source-specific application identifier."));
  if (Number.isFinite(summary.decisionRecordedCount)) cards.push(metricCard("Records with a decision date", number(summary.decisionRecordedCount), period, "A recorded decision is not evidence that construction commenced or completed."));
  if (Number.isFinite(summary.activeApplicationCount)) cards.push(metricCard("Current applications", number(summary.activeApplicationCount), `Status checked ${artifact.publication?.statusReferenceDate || "on the source retrieval date"}`, "Current status can change after the reference date."));
  if (Number.isFinite(summary.quantifiedResidentialProjects)) cards.push(metricCard("Projects with stated dwelling yield", number(summary.quantifiedResidentialProjects), period, "Only projects whose official description explicitly states a dwelling quantity."));
  const proposed = summary.netProposedDwellings ?? summary.statedProposedDwellings;
  if (Number.isFinite(proposed)) cards.push(metricCard("Stated proposed dwellings", number(proposed), period, "Proposal quantity only; not an approval, commencement or completion count."));
  const weighted = summary.weightedNetPipeline ?? summary.statusWeightedProposedDwellings ?? summary.statusWeightedPipeline;
  if (Number.isFinite(weighted)) cards.push(metricCard("Status-weighted proposals", number(weighted, 2), `Model status reference ${artifact.publication?.statusReferenceDate || "source retrieval date"}`, "AusHomeValue model indicator; not a physical dwelling count."));
  return cards;
}

function contextCards(artifact) {
  const service = artifact.councilPlanningService || {};
  const period = `Council-wide period ending ${service.periodEnd || "2025"}`;
  const cards = [];
  if (Number.isFinite(service.medianDecisionDays)) cards.push(metricCard("Council median decision time", `${number(service.medianDecisionDays)} days`, period, "Council-wide service metric; not a suburb-level processing time."));
  if (Number.isFinite(service.decidedWithinRequiredTimePercent)) cards.push(metricCard("Decisions within required time", `${number(service.decidedWithinRequiredTimePercent, 2)}%`, period, "Council-wide service metric; not a suburb-level application result."));
  if (Number.isFinite(service.applicationsReceived)) cards.push(metricCard("Applications received by council", number(service.applicationsReceived), period, "Whole-council total; not the number lodged in this suburb."));
  const targetPercent = service.targetPercent ?? service.decidedWithinRequiredTimeTargetPercent;
  if (Number.isFinite(targetPercent)) cards.push(metricCard("Council service target", `${number(targetPercent, 2)}%`, period, "Council-wide target; not a suburb-level result."));
  if (Number.isFinite(service.medianDecisionDaysTarget)) cards.push(metricCard("Council decision-time target", `${number(service.medianDecisionDaysTarget)} days`, period, "Council-wide target; not a suburb-level processing time."));
  if (artifact.activityCentre?.included) cards.push(metricCard("Activity-centre policy signal", "Included", artifact.activityCentre.programGroup || "Victorian activity-centre program", artifact.activityCentre.description || "Policy context only; it does not predict property-level development."));
  return cards;
}

function developmentCards(artifact) {
  const summary = artifact.summary || {};
  const snapshot = `Official snapshot ${String(artifact.source?.dataProcessedAt || "").slice(0, 10)}`;
  return [
    metricCard("Active major development projects", number(summary.activeProjectCount), snapshot, "Applied, approved or under-construction major projects; not all planning applications."),
    metricCard("Applied", number(summary.appliedProjectCount), snapshot, "Official development-status label; not an approval."),
    metricCard("Approved", number(summary.approvedProjectCount), snapshot, "Official development-status label; not evidence of construction."),
    metricCard("Under construction", number(summary.underConstructionProjectCount), snapshot, "Major projects recorded as under construction in the official snapshot."),
    metricCard("Active residential projects", number(summary.activeResidentialProjectCount), snapshot, "Active major projects with a positive stated residential dwelling field."),
    metricCard("Stated dwellings in active pipeline", number(summary.activeResidentialDwellingCount), snapshot, "Project capacity only; not completed homes and does not predict future supply."),
  ];
}

function councilContract(artifact) {
  const contracts = {
    "City of Monash": {
      marker: "AHV_PLANNING_PIPELINE",
      label: "Planning pipeline — City of Monash planning applications lodged in 2025",
      notes: ["Planning applications, not building permits, commencements or completions.", "Status-weighted pipeline is a model indicator, not a physical dwelling count."],
      partial: "Monash-council portion only",
    },
    "City of Boroondara": {
      marker: "AHV_PLANNING_PIPELINE",
      label: "City of Boroondara planning applications registered in 2025",
      notes: ["Duplicate report rows removed.", "Stated proposed dwellings are proposals. Not net additions or completed homes.", "Current status is not shown."],
      partial: "Boroondara-council portion only",
    },
    "Whitehorse City Council": {
      marker: "AHV_WHITEHORSE_PLANNING",
      label: "Whitehorse City Council planning applications lodged in 2025",
      notes: ["Stated proposed dwellings are proposals. Not net additions or completed homes.", "Status-weighted proposals are a Model indicator, not a physical dwelling count."],
      partial: "Whitehorse-council portion only",
    },
    "Manningham City Council": {
      marker: "AHV_MANNINGHAM_PLANNING",
      label: "Manningham City Council planning applications lodged in 2025",
      notes: ["Stated proposed dwellings are proposals. Not net additions or completed homes."],
      partial: "Manningham-council portion only",
    },
    "City of Casey": {
      marker: "AHV_CASEY_PLANNING",
      label: "City of Casey planning applications lodged in 2025",
      notes: ["Casey council records only.", "Applications are not dwelling counts, commencements or completions."],
    },
    "City of Melbourne": {
      marker: "AHV_MELBOURNE_DEVELOPMENT",
      label: "City of Melbourne Development Activity Monitor",
      notes: ["Major development sites only; not every planning application or building permit.", "Stated dwelling capacity is not an approval, commencement or completion count."],
    },
    "Glen Eira City Council": { marker: "AHV_GLEN_EIRA_PLANNING_CONTEXT", label: "Council-wide planning service facts" },
    "Bayside City Council": { marker: "AHV_BAYSIDE_PLANNING_CONTEXT", label: "Council-wide planning service facts" },
    "City of Stonnington": { marker: "AHV_STONNINGTON_PLANNING_CONTEXT", label: "Council-wide planning service facts" },
    "Banyule City Council": { marker: "AHV_BANYULE_PLANNING_CONTEXT", label: "Council-wide planning service facts" },
    "Kingston City Council": { marker: "AHV_KINGSTON_PLANNING_CONTEXT", label: "Council-wide planning service facts" },
  };
  return contracts[artifact._council] || { marker: "AHV_COUNCIL_PLANNING", label: "Verified council planning evidence" };
}

function sourceLinks(artifacts) {
  const links = new Map();
  for (const artifact of artifacts) {
    const candidates = artifact.source ? [artifact.source] : artifact.sources || [];
    for (const source of candidates) {
      if (!source?.url) continue;
      const label = source.publisher && (source.sourceReport || source.report)
        ? `${source.publisher} — ${source.sourceReport || source.report}`
        : source.publisher || source.sourceReport || source.report || "Official planning source";
      links.set(source.url, label);
    }
  }
  return [...links].map(([url, label]) => ({ url, label }));
}

export function buildCouncilResearchPage(artifacts) {
  if (!artifacts.length) throw new Error("At least one planning artifact is required");
  const suburb = artifacts[0]._suburb;
  const postcode = [...new Set(artifacts.map((item) => item._postcode).filter(Boolean))].join(" / ");
  const councils = [...new Set(artifacts.map((item) => item._council))];
  const slug = slugify(suburb);
  const canonical = `https://www.aushomevalue.com.au/suburb/${slug}-vic.html`;
  const sections = artifacts.map((artifact) => {
    const isPipeline = artifact.schemaVersion === "planning-pipeline-summary-v1";
    const isDevelopment = artifact.schemaVersion === "development-activity-summary-v1";
    const cards = isPipeline
      ? pipelineCards(artifact)
      : isDevelopment
        ? developmentCards(artifact)
        : contextCards(artifact);
    const contract = councilContract(artifact);
    const coverage = isPipeline || isDevelopment
      ? artifact.publication?.grain || artifact.geography?.note || "Official aggregate planning records"
      : artifact.geography?.note || "Council-wide planning service context only";
    const heading = isPipeline
      ? "规划申请汇总 / Planning applications"
      : isDevelopment
        ? "主要开发活动 / Major development activity"
        : "Council规划背景 / Council planning context";
    const isPartial = artifact.geography?.councilCoverage && artifact.geography.councilCoverage !== "full"
      || /crosses council boundaries|portion/i.test(artifact.geography?.note || "");
    const contractNotes = [...(contract.notes || []), ...(isPartial && contract.partial ? [contract.partial] : [])];
    return `<!-- ${contract.marker}_START --><section><div class="section-kicker">${escapeHtml(artifact._council)}</div><h2>${heading}</h2><p><strong>${escapeHtml(contract.label)}</strong></p><p class="section-intro">${escapeHtml(coverage)}</p>${contractNotes.map((item) => `<p class="contract-note">${escapeHtml(item)}</p>`).join("")}<div class="metric-grid">${cards.join("")}</div><details><summary>口径限制 / Limitations</summary><ul>${(artifact.publication?.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details></section><!-- ${contract.marker}_END -->`;
  }).join("\n  ");
  const sources = sourceLinks(artifacts);
  const referenceLabel = artifacts.some(
    (item) => item.schemaVersion === "development-activity-summary-v1",
  )
    ? "Latest official development snapshot"
    : "Planning evidence reference year 2025";
  const evidenceType = artifacts.some((item) => item.schemaVersion === "planning-pipeline-summary-v1")
    ? "This page contains official aggregate suburb planning records. Counts remain proposals or register records, not completed housing."
    : artifacts.some((item) => item.schemaVersion === "development-activity-summary-v1")
      ? "This page contains official aggregate major-development activity. Project and stated-dwelling counts are pipeline facts, not completed housing, and do not predict future prices."
    : "Only council-wide planning-service context is currently verified for this suburb. No suburb application count is inferred.";
  const structured = artifacts.flatMap((artifact) => {
    const summary = artifact.summary || {};
    if (artifact.schemaVersion === "development-activity-summary-v1") {
      return [
        { "@type": "PropertyValue", name: `${artifact._council} activeMajorDevelopmentProjects`, value: summary.activeProjectCount, unitText: "projects" },
        { "@type": "PropertyValue", name: `${artifact._council} statedDwellingsInActiveMajorDevelopmentPipeline`, value: summary.activeResidentialDwellingCount, unitText: "dwellings" },
      ];
    }
    if (artifact.schemaVersion !== "planning-pipeline-summary-v1") return [];
    const applicationCount = summary.rawApplicationCount ?? summary.lodgedApplicationCount ?? summary.registeredApplicationCount;
    const values = [];
    if (Number.isFinite(applicationCount)) values.push({ "@type": "PropertyValue", name: `${artifact._council} planningApplicationRecords2025`, value: applicationCount, unitText: "records" });
    if (Number.isFinite(summary.uniqueProjectCount)) values.push({ "@type": "PropertyValue", name: `${artifact._council} uniquePlanningProjects2025`, value: summary.uniqueProjectCount, unitText: "projects" });
    return values;
  });

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(suburb)} VIC Suburb Research | AusHomeValue</title>
  <meta name="description" content="${escapeHtml(suburb)} VIC property prices, Future Opportunity signals, valuation access and source-labelled council planning evidence.">
  <link rel="canonical" href="${canonical}"><meta name="robots" content="index, follow">
  <meta property="og:title" content="${escapeHtml(suburb)} Suburb Research | AusHomeValue"><meta property="og:description" content="Current median prices, Future Opportunity signals, valuation access and verified planning evidence for ${escapeHtml(suburb)}."><meta property="og:url" content="${canonical}"><meta property="og:type" content="website">
  <link rel="stylesheet" href="/shared-responsive.css">
  <style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:1040px;margin:auto;padding:32px 20px 60px}.breadcrumb,.eyebrow,.section-intro,.metric-meta,.metric-card p{color:#66736d}.breadcrumb{font-size:.85rem;margin-bottom:20px}.breadcrumb a,.sources a{color:#0d6b57}h1{font-size:clamp(1.8rem,5vw,2.7rem);line-height:1.15;margin:0 0 10px}.eyebrow{margin:0 0 24px}.overview,.market-snapshot{background:#fff;border:1px solid #dbe2de;border-radius:14px;padding:22px}section{margin-top:36px}h2{font-size:1.35rem;margin:5px 0 6px}.section-kicker{color:#0d6b57;font-size:.74rem;font-weight:800;letter-spacing:.07em}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.metric-card{background:#fff;border:1px solid #dbe2de;border-radius:12px;padding:18px}.market-snapshot .metric-card{background:#f7faf8}.metric-label{text-transform:uppercase;letter-spacing:.04em;color:#66736d;font-size:.76rem;font-weight:700}.metric-value{font-size:1.45rem;font-weight:800;margin:6px 0}.market-rent-value{font-size:1.05rem}.metric-meta{font-size:.82rem}.metric-card p{font-size:.78rem;margin:8px 0 0}.valuation-cta{display:flex;justify-content:space-between;align-items:center;gap:18px;background:#e8f3ef;border-radius:10px;padding:16px;margin-top:16px}.valuation-cta span{color:#52605a}.valuation-cta a{flex:0 0 auto;background:#0d6b57;color:#fff;text-decoration:none;font-weight:800;border-radius:8px;padding:10px 14px}details{margin-top:14px;background:#edf2ef;border-radius:9px;padding:10px 14px}summary{cursor:pointer;font-weight:700}.sources ul{padding-left:20px}.sources li{margin:7px 0}.notice{background:#e8f3ef;border-left:4px solid #0d6b57;padding:14px 16px;margin-top:34px;border-radius:6px}.footer{border-top:1px solid #dbe2de;padding:24px;text-align:center;color:#66736d;font-size:.8rem}@media(max-width:560px){.container{padding:24px 14px 44px}.metric-grid{grid-template-columns:1fr}.metric-card,.overview,.market-snapshot{padding:16px}.valuation-cta{align-items:stretch;flex-direction:column}.valuation-cta a{text-align:center}}</style>
  <script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Place", name: `${suburb}, VIC`, url: canonical, containedInPlace: councils.map((name) => ({ "@type": "AdministrativeArea", name })), additionalProperty: structured })}</script>
</head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container">
  <div class="breadcrumb"><a href="/">Home</a> / <a href="/suburb-research.html">Suburb Research</a> / ${escapeHtml(suburb)}</div>
  <h1>${escapeHtml(suburb)}, VIC — 区域研究</h1><p class="eyebrow">Postcode ${escapeHtml(postcode || "not stated")} · ${escapeHtml(councils.join(" / "))} · ${escapeHtml(referenceLabel)}</p>
  <section class="overview"><div class="section-kicker">SUBURB RESEARCH V2 · MARKET + PLANNING</div><h2>如何阅读本页？</h2><p>${escapeHtml(evidenceType)}</p><p>顶部市场快照来自AusHomeValue当前数据库；下方规划数据来自已核验官方来源。房价是区域中位数，不是具体物业估值；租金、收益率或空置率没有合格口径时会明确标记缺失，不沿用旧值。</p></section>
  ${marketSnapshotPanel(suburb)}
  ${sections}
  <section class="sources"><h2>数据来源 / Verified sources</h2><ul>${sources.map((source) => `<li><a href="${escapeHtml(source.url)}" rel="noopener noreferrer">${escapeHtml(source.label)}</a></li>`).join("")}</ul></section>
  <div class="notice"><strong>投资阅读边界：</strong>规划申请和Council服务指标可以说明开发活动及行政背景，但不能单独证明未来房价、租金、实际供应或某套物业能够开发。本页不构成投资、规划或财务建议。</div>
</main><footer class="footer">© ${new Date().getFullYear()} AusHomeValue · Research information only, not financial advice.</footer><script type="module" src="/suburb-market-snapshot.js"></script></body></html>
`;
  return html.replace(/[ \t]+$/gm, "");
}

export function buildResearchIndex(groups, validatedFiles = []) {
  const councilGroups = new Map();
  for (const [suburb, artifacts] of groups) {
    for (const council of new Set(artifacts.map((item) => item._council))) {
      if (!councilGroups.has(council)) councilGroups.set(council, new Map());
      councilGroups.get(council).set(suburb, artifacts[0]);
    }
  }
  const publishedSlugs = new Set([...groups.keys()].map((suburb) => `${slugify(suburb)}-vic.html`));
  for (const filename of validatedFiles) publishedSlugs.add(filename);
  const totalSuburbs = publishedSlugs.size;
  const validatedLinks = validatedFiles
    .map((filename) => {
      const suburb = filename.replace(/-vic\.html$/, "").replaceAll("-", " ");
      return `<a href="/suburb/${escapeHtml(filename)}">${escapeHtml(titleCase(suburb))}</a>`;
    })
    .join("");
  const sections = [...councilGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([council, suburbs]) =>
    `<section><h2>${escapeHtml(council)}</h2><p>${suburbs.size}个已核验区域 / verified suburbs</p><div class="suburb-grid">${[...suburbs.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([suburb]) => `<a href="/suburb/${slugify(suburb)}-vic.html">${escapeHtml(titleCase(suburb))}</a>`).join("")}</div></section>`
  ).join("\n");
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>维州区域研究 | Suburb Research | AusHomeValue</title>
  <meta name="description" content="AusHomeValue source-labelled suburb research across processed Victorian councils, separating direct facts, council context and model estimates.">
  <link rel="canonical" href="https://www.aushomevalue.com.au/suburb-research.html"><meta name="robots" content="index, follow">
  <link rel="stylesheet" href="/shared-responsive.css">
  <style>*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#17211d;font-family:Inter,system-ui,-apple-system,sans-serif;line-height:1.55}.topbar{background:#0d6b57;padding:14px 24px}.topbar a{color:#fff;text-decoration:none;font-weight:700}.container{max-width:1100px;margin:auto;padding:42px 20px 64px}.eyebrow{color:#0d6b57;font-weight:800;letter-spacing:.06em}h1{font-size:clamp(2rem,5vw,3.2rem);line-height:1.1;margin:8px 0 14px}.intro{max-width:820px;color:#52605a}.method{display:flex;gap:8px;flex-wrap:wrap;margin:24px 0}.method span{background:#fff;border:1px solid #dbe2de;border-radius:999px;padding:7px 11px;font-size:.8rem}.pilot{display:block;background:#fff;border:1px solid #9bc5b8;border-radius:14px;padding:20px;color:inherit;text-decoration:none;margin:28px 0}.pilot strong{display:block;font-size:1.2rem}.summary{background:#e8f3ef;border-radius:10px;padding:14px 16px}section{margin-top:34px}section h2{margin-bottom:0}.suburb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin-top:12px}.suburb-grid a{background:#fff;border:1px solid #dbe2de;border-radius:9px;padding:10px 12px;color:#0d6b57;text-decoration:none}.archive{margin-top:34px;color:#66736d}.archive a{color:#0d6b57}@media(max-width:600px){.container{padding:30px 14px 48px}.suburb-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}</style>
</head><body><div class="topbar"><a href="/">← AusHomeValue</a></div><main class="container">
  <div class="eyebrow">SUBURB RESEARCH · 区域研究</div><h1>先看证据，再判断区域。</h1>
  <p class="intro">每个页面同时提供当前房价与投资信号、具体物业估值入口，以及已核验的Council规划证据。直接事实、区域背景和模型估算分开呈现；没有可靠来源的指标不会沿用旧值。</p>
  <div class="method"><span>直接事实 / Direct facts</span><span>Council或区域背景 / Area context</span><span>模型估算 / Model estimates</span><span>明确时间、地理范围和限制</span></div>
  <div class="summary"><strong>${totalSuburbs}个区域 · ${councilGroups.size}个已处理Council</strong><br>市场快照读取AusHomeValue当前数据库，规划证据来自已核验官方来源；跨Council suburb分别保留各Council口径。</div>
  <a class="pilot" href="/suburb/oakleigh-vic.html"><strong>Oakleigh — 完整验证示范页</strong><span>包含已核实房价、租赁区域背景、Census基线、就业背景、Building Permits和Planning Pipeline。</span></a>
  <section><h2>完整验证页 / Fully validated profiles</h2><p>${validatedFiles.length}个区域已完成多来源指标验证。</p><div class="suburb-grid">${validatedLinks}</div></section>
  ${sections}
  <p class="archive">较早的自动市场文章仍可在<a href="/blog/">历史研究文章</a>中查看；旧评分不属于当前Suburb Research V2发布口径。</p>
</main></body></html>
`;
}

export function generateCouncilResearchPages({ onlyCouncil = null } = {}) {
  const artifacts = planningArtifacts();
  const groups = new Map();
  for (const artifact of artifacts) {
    const key = artifact._suburb.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(artifact);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [suburb, group] of groups) {
    if (onlyCouncil && !group.some((artifact) => artifact._council === onlyCouncil)) continue;
    const outputPath = path.join(OUTPUT_DIR, `${slugify(suburb)}-vic.html`);
    fs.writeFileSync(outputPath, buildCouncilResearchPage(group));
  }
  const validated = generateValidatedPages();
  fs.writeFileSync(INDEX_PATH, buildResearchIndex(groups, validated));
  return {
    councilArtifacts: artifacts.length,
    councilSuburbs: groups.size,
    validatedPages: validated.length,
    publishedPages: new Set([
      ...groups.keys().map((suburb) => `${slugify(suburb)}-vic.html`),
      ...validated,
    ]).size,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const councilArg = process.argv.find((arg) => arg.startsWith("--council="));
  console.log(JSON.stringify(generateCouncilResearchPages({
    onlyCouncil: councilArg ? councilArg.slice("--council=".length) : null,
  })));
}
