function text(value) { return value == null ? "" : String(value).trim(); }
function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const FIELD_ALIASES = Object.freeze({
  permitNumber: ["permit number", "building permit number", "permit no", "permit_no"],
  permitStageNumber: ["permit stage number", "permit_stage_number"],
  issueDate: ["issue date", "permit issue date", "date issued", "issue_date", "permit_date"],
  municipality: ["municipality", "municipal council", "council", "lga", "site_municipality", "municipal full name"],
  suburb: ["suburb", "town", "locality", "site_town_suburb__c", "site_suburb"],
  postcode: ["postcode", "post code", "site_postcode__c", "site_pcode"],
  description: ["description", "works description", "nature of work", "work description"],
  buildingUse: ["building use", "building class", "proposed use", "use", "basis_building_use", "basis_bca"],
  newDwellings: ["new dwellings", "dwellings created", "number of dwellings", "num dwellings", "number_of_new_dwellings__c", "dwellings_after_work"],
  demolishedDwellings: ["dwellings demolished", "demolished dwellings", "demolitions", "number_of_dwellings_demolished__c", "number_demolished"],
  estimatedCost: ["estimated cost", "cost of works", "cost", "total_estimated_cost_of_works__c", "reported_cost_of_works", "cost_of_works_domestic"],
});

function normalizedKeys(row) {
  return new Map(Object.keys(row).map((key) => [key.trim().toLowerCase().replace(/[_-]+/g, " "), key]));
}

function pick(row, aliases) {
  const keys = normalizedKeys(row);
  for (const alias of aliases) {
    const original = keys.get(alias.replace(/[_-]+/g, " "));
    if (original) return row[original];
  }
  return null;
}

function isoDate(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return new Date(excelEpoch + value * 86400000).toISOString().slice(0, 10);
  }
  const raw = text(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  const au = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (au) return `${au[3]}-${au[2].padStart(2, "0")}-${au[1].padStart(2, "0")}`;
  return null;
}

export function normalizeBuildingPermitRow(row, { sourceKey = "bpc_building_permits" } = {}) {
  const values = Object.fromEntries(Object.entries(FIELD_ALIASES).map(([key, aliases]) => [key, pick(row, aliases)]));
  const description = text(values.description);
  const buildingUse = text(values.buildingUse);
  const explicitNew = number(values.newDwellings);
  const explicitDemolished = number(values.demolishedDwellings);
  const residentialEvidence = /dwelling|domestic|residential|house|apartment|townhouse|class\s*1|class\s*2|^1[ab]?\b|^2\b/i.test(`${description} ${buildingUse}`);
  const newDwellingEvidence = /new|construct|erect|addition/i.test(description);
  const demolitionEvidence = /demolish|demolition/i.test(description);
  const inferredNew = explicitNew == null && residentialEvidence && newDwellingEvidence ? 1 : null;
  const inferredDemolished = explicitDemolished == null && residentialEvidence && demolitionEvidence ? 1 : null;
  const warnings = [];
  if (explicitNew == null && inferredNew != null) warnings.push("new_dwellings_inferred_from_description");
  if (explicitDemolished == null && inferredDemolished != null) warnings.push("demolished_dwellings_inferred_from_description");
  if (!text(values.suburb)) warnings.push("missing_suburb");
  if (!text(values.municipality)) warnings.push("missing_municipality");
  if (!isoDate(values.issueDate)) warnings.push("missing_or_invalid_issue_date");
  return {
    permitNumber: text(values.permitNumber) || null,
    permitStageNumber: number(values.permitStageNumber),
    issueDate: isoDate(values.issueDate),
    municipality: text(values.municipality) || null,
    suburb: text(values.suburb).toUpperCase() || null,
    postcode: text(values.postcode) || null,
    description: description || null,
    buildingUse: buildingUse || null,
    newDwellings: explicitNew ?? inferredNew,
    demolishedDwellings: explicitDemolished ?? inferredDemolished,
    estimatedCost: number(values.estimatedCost),
    residentialEvidence,
    sourceKey,
    quality: explicitNew != null ? "reported" : inferredNew != null ? "inferred" : "unknown",
    warnings,
  };
}

export function aggregateResidentialPermitSupply(rows, { suburb, postcode, municipality, periodStart, periodEnd } = {}) {
  const wanted = text(suburb).toUpperCase();
  const wantedPostcode = text(postcode);
  const wantedMunicipality = text(municipality).toUpperCase();
  const normalized = rows.map((row) => normalizeBuildingPermitRow(row))
    .filter((row) => (!wanted || row.suburb === wanted)
      && (!wantedPostcode || row.postcode === wantedPostcode)
      && (!wantedMunicipality || row.municipality?.toUpperCase().includes(wantedMunicipality))
      && (!periodStart || row.issueDate >= periodStart)
      && (!periodEnd || row.issueDate <= periodEnd));
  const eligible = normalized.filter((row) => row.residentialEvidence
    && (row.newDwellings != null || row.demolishedDwellings != null));
  const supplyRows = eligible.filter((row) => (row.newDwellings || 0) > 0 || (row.demolishedDwellings || 0) > 0);
  return {
    suburb: wanted || null,
    postcode: wantedPostcode || null,
    municipality: wantedMunicipality || null,
    permitCount: supplyRows.length,
    matchedPermitCount: normalized.length,
    residentialPermitCount: eligible.length,
    newDwellings: eligible.reduce((sum, row) => sum + Math.max(0, row.newDwellings || 0), 0),
    demolishedDwellings: eligible.reduce((sum, row) => sum + Math.max(0, row.demolishedDwellings || 0), 0),
    netAdditionalDwellings: eligible.reduce((sum, row) => sum + Math.max(0, row.newDwellings || 0) - Math.max(0, row.demolishedDwellings || 0), 0),
    reportedDwellingRows: eligible.filter((row) => row.quality === "reported").length,
    inferredDwellingRows: eligible.filter((row) => row.quality === "inferred").length,
    excludedRows: normalized.length - eligible.length,
  };
}
