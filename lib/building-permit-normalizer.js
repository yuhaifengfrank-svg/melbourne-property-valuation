function text(value) { return value == null ? "" : String(value).trim(); }
function number(value) {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const FIELD_ALIASES = Object.freeze({
  permitNumber: ["permit number", "building permit number", "permit no", "permit_no"],
  issueDate: ["issue date", "permit issue date", "date issued", "issue_date"],
  municipality: ["municipality", "municipal council", "council", "lga"],
  suburb: ["suburb", "town", "locality"],
  postcode: ["postcode", "post code"],
  description: ["description", "works description", "nature of work", "work description"],
  buildingUse: ["building use", "building class", "proposed use", "use"],
  newDwellings: ["new dwellings", "dwellings created", "number of dwellings", "num dwellings"],
  demolishedDwellings: ["dwellings demolished", "demolished dwellings", "demolitions"],
  estimatedCost: ["estimated cost", "cost of works", "cost"],
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

export function normalizeBuildingPermitRow(row, { sourceKey = "bpc_building_permits" } = {}) {
  const values = Object.fromEntries(Object.entries(FIELD_ALIASES).map(([key, aliases]) => [key, pick(row, aliases)]));
  const description = text(values.description);
  const buildingUse = text(values.buildingUse);
  const explicitNew = number(values.newDwellings);
  const explicitDemolished = number(values.demolishedDwellings);
  const residentialEvidence = /dwelling|residential|house|apartment|townhouse|class\s*1|class\s*2/i.test(`${description} ${buildingUse}`);
  const newDwellingEvidence = /new|construct|erect|addition/i.test(description);
  const demolitionEvidence = /demolish|demolition/i.test(description);
  const inferredNew = explicitNew == null && residentialEvidence && newDwellingEvidence ? 1 : null;
  const inferredDemolished = explicitDemolished == null && residentialEvidence && demolitionEvidence ? 1 : null;
  const warnings = [];
  if (explicitNew == null && inferredNew != null) warnings.push("new_dwellings_inferred_from_description");
  if (explicitDemolished == null && inferredDemolished != null) warnings.push("demolished_dwellings_inferred_from_description");
  if (!text(values.suburb)) warnings.push("missing_suburb");
  if (!text(values.municipality)) warnings.push("missing_municipality");
  return {
    permitNumber: text(values.permitNumber) || null,
    issueDate: text(values.issueDate).slice(0, 10) || null,
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

export function aggregateResidentialPermitSupply(rows, { suburb, periodStart, periodEnd } = {}) {
  const wanted = text(suburb).toUpperCase();
  const normalized = rows.map((row) => normalizeBuildingPermitRow(row))
    .filter((row) => (!wanted || row.suburb === wanted)
      && (!periodStart || row.issueDate >= periodStart)
      && (!periodEnd || row.issueDate <= periodEnd));
  const eligible = normalized.filter((row) => row.residentialEvidence && row.newDwellings != null);
  return {
    suburb: wanted || null,
    permitCount: eligible.length,
    newDwellings: eligible.reduce((sum, row) => sum + Math.max(0, row.newDwellings || 0), 0),
    demolishedDwellings: eligible.reduce((sum, row) => sum + Math.max(0, row.demolishedDwellings || 0), 0),
    netAdditionalDwellings: eligible.reduce((sum, row) => sum + Math.max(0, row.newDwellings || 0) - Math.max(0, row.demolishedDwellings || 0), 0),
    reportedDwellingRows: eligible.filter((row) => row.quality === "reported").length,
    inferredDwellingRows: eligible.filter((row) => row.quality === "inferred").length,
    excludedRows: normalized.length - eligible.length,
  };
}
