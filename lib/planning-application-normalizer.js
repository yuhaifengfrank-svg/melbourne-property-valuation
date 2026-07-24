const WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
});

function text(value) { return value == null ? "" : String(value).trim(); }

function isoDate(value) {
  const raw = text(value);
  const au = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (au) return `${au[3]}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function quantity(value) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return WORD_NUMBERS[normalized] ?? null;
}

export function extractDwellingYield(description) {
  const raw = text(description);
  const lower = raw.toLowerCase();
  const warnings = [];
  if (!/dwelling|apartment|residential building|rooming house/.test(lower)) {
    return { newDwellings: null, demolishedDwellings: null, netDwellings: null, quality: "not_applicable", warnings };
  }
  if (/variation of (?:a )?restrictive covenant/.test(lower)
    && !/construct(?:ion)?|development of|develop the/.test(lower)) {
    warnings.push("covenant_change_without_dwelling_development");
    return { newDwellings: null, demolishedDwellings: null, netDwellings: null, quality: "unresolved", warnings };
  }
  if (/\b(?:addition|alteration|extension)\s+(?:of|to)\b/.test(lower)
    && !/construct(?:ion)?|development of|develop the|new dwelling|second dwelling/.test(lower)) {
    return { newDwellings: 0, demolishedDwellings: 0, netDwellings: 0, quality: "explicit_no_new_supply", warnings };
  }
  if (/addition|alteration|extension|verandah|garage|carport|front fence/.test(lower)
    && !/construct(?:ion)?\s+(?:of\s+)?(?:a\s+)?(?:new\s+)?(?:\w+\s+)?dwelling|second dwelling|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+\s*\)?\s*dwellings/.test(lower)) {
    return { newDwellings: 0, demolishedDwellings: 0, netDwellings: 0, quality: "explicit_no_new_supply", warnings };
  }
  const match = lower.match(/(?:construction|construct|development)[^.;]{0,80}?\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*(?:\(\s*\d+\s*\))?\s+(?:double[- ]storey\s+)?dwellings?\b/)
    || lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s*\(?(?:\d+)?\)?\s+(?:double[- ]storey\s+)?dwellings?\b/);
  let newDwellings = match ? quantity(match[1]) : null;
  if (newDwellings == null && /\b(?:a|one)\s+(?:new\s+|small second\s+)?dwelling\b|\bconstruction of a dwelling\b/.test(lower)) newDwellings = 1;
  if (newDwellings == null && /rooming house|serviced apartment|residential building/.test(lower)) {
    warnings.push("residential_yield_not_stated");
  }
  const demolishedDwellings = /demolition of (?:an?|one|the) (?:existing )?dwelling/.test(lower) ? 1 : 0;
  return {
    newDwellings,
    demolishedDwellings: newDwellings == null ? null : demolishedDwellings,
    netDwellings: newDwellings == null ? null : newDwellings - demolishedDwellings,
    quality: newDwellings == null ? "unresolved" : "description_extracted",
    warnings,
  };
}

export function planningStatusWeight({ status, decision } = {}) {
  const value = `${text(status)} ${text(decision)}`.toLowerCase();
  if (/withdrawn|lapsed|refus|incorrectly lodged|no permit required/.test(value)) return 0;
  if (/appeal|vcat/.test(value)) return 0.5;
  if (/planning permit to issue|permit issued|permit to issue|plan endorsed|amended permit|extended permit/.test(value)) return 1;
  if (/notice of decision/.test(value)) return 0.8;
  if (/advertis|under assessment|assessment|lodged/.test(value)) return 0.35;
  if (/further information/.test(value)) return 0.2;
  return 0.1;
}

export function normalizePlanningApplication(row, { sourceKey = "council_planning_register" } = {}) {
  const applicationNumber = text(row.applicationNumber ?? row.application ?? row.number).toUpperCase();
  const description = text(row.description);
  const dwellingYield = extractDwellingYield(description);
  const amendment = /\/[A-Z]$/.test(applicationNumber);
  return {
    applicationNumber: applicationNumber || null,
    baseApplicationNumber: applicationNumber.replace(/\/[A-Z]$/, "") || null,
    amendment,
    lodgedDate: isoDate(row.lodgedDate ?? row.lodged),
    applicationType: text(row.applicationType ?? row.type) || null,
    location: text(row.location ?? row.address) || null,
    suburb: text(row.suburb).toUpperCase() || null,
    postcode: text(row.postcode) || null,
    description: description || null,
    status: text(row.status) || null,
    decision: text(row.decision ?? row.currentDecision) || null,
    statusWeight: planningStatusWeight({ status: row.status, decision: row.decision ?? row.currentDecision }),
    ...dwellingYield,
    sourceKey,
  };
}

export function aggregatePlanningPipeline(rows, { suburb, postcode } = {}) {
  const wantedSuburb = text(suburb).toUpperCase();
  const wantedPostcode = text(postcode);
  const normalized = rows.map((row) => normalizePlanningApplication(row))
    .filter((row) => (!wantedSuburb || row.suburb === wantedSuburb)
      && (!wantedPostcode || row.postcode === wantedPostcode));
  const byBase = new Map();
  for (const row of normalized.sort((a, b) => (b.lodgedDate || "").localeCompare(a.lodgedDate || ""))) {
    if (!byBase.has(row.baseApplicationNumber)) byBase.set(row.baseApplicationNumber, row);
  }
  const unique = [...byBase.values()];
  // A zero assigned to an alteration/extension is a confirmed non-supply row,
  // not a project with a stated dwelling yield.
  const quantified = unique.filter((row) => row.quality === "description_extracted");
  return {
    suburb: wantedSuburb || null,
    postcode: wantedPostcode || null,
    rawApplicationCount: normalized.length,
    uniqueProjectCount: unique.length,
    amendmentCount: normalized.filter((row) => row.amendment).length,
    quantifiedResidentialProjects: quantified.length,
    grossProposedDwellings: quantified.reduce((sum, row) => sum + row.newDwellings, 0),
    netProposedDwellings: quantified.reduce((sum, row) => sum + row.netDwellings, 0),
    weightedNetPipeline: quantified.reduce((sum, row) => sum + row.netDwellings * row.statusWeight, 0),
    unresolvedResidentialProjects: unique.filter((row) => row.quality === "unresolved").length,
    projects: unique,
  };
}
