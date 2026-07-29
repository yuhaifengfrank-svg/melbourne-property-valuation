const NON_NEGATIVE_INTEGER_FIELDS = [
  "lodgedApplicationCount",
  "uniqueProjectCount",
  "decisionRecordedCount",
  "activeApplicationCount",
];

function requiredText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

function isoDate(value, field) {
  const text = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${field} must be YYYY-MM-DD`);
  }
  return text;
}

export function normalizePlanningMetricArtifact(artifact) {
  if (!artifact || artifact.schemaVersion !== "planning-pipeline-summary-v1") {
    throw new Error("Unsupported planning metric artifact");
  }
  if (artifact.publication?.publishable !== true) {
    throw new Error("Planning metric artifact is not publishable");
  }

  const summary = artifact.summary || {};
  for (const field of NON_NEGATIVE_INTEGER_FIELDS) {
    if (!Number.isInteger(summary[field]) || summary[field] < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }
  if (summary.uniqueProjectCount > summary.lodgedApplicationCount
    || summary.decisionRecordedCount > summary.lodgedApplicationCount
    || summary.activeApplicationCount > summary.lodgedApplicationCount) {
    throw new Error("Planning metric counts are inconsistent");
  }

  const sourceRows = Number(artifact.quality?.sourceRows);
  const accountedRows = Number(artifact.quality?.allCouncilGeographyRowsAccountedFor);
  if (!Number.isInteger(sourceRows) || sourceRows <= 0 || sourceRows !== accountedRows) {
    throw new Error("Council source row reconciliation failed");
  }

  return {
    council: requiredText(artifact.geography?.council, "council"),
    suburb: requiredText(artifact.filters?.suburb, "suburb").toLowerCase(),
    state: "VIC",
    postcode: requiredText(artifact.filters?.postcode, "postcode"),
    periodStart: isoDate(artifact.filters?.lodgedStart, "lodgedStart"),
    periodEnd: isoDate(artifact.filters?.lodgedEnd, "lodgedEnd"),
    lodgedApplicationCount: summary.lodgedApplicationCount,
    uniqueProjectCount: summary.uniqueProjectCount,
    decisionRecordedCount: summary.decisionRecordedCount,
    activeApplicationCount: summary.activeApplicationCount,
    sourceKey: "casey_planning_register",
    sourcePublisher: requiredText(artifact.source?.publisher, "source.publisher"),
    sourceUrl: requiredText(artifact.source?.url, "source.url"),
    sourceLicence: String(artifact.source?.licence ?? "").trim() || null,
    sourceRetrievedAt: requiredText(artifact.source?.retrievedAt, "source.retrievedAt"),
    statusReferenceDate: isoDate(
      artifact.publication?.statusReferenceDate,
      "statusReferenceDate",
    ),
    geographyScope: requiredText(artifact.geography?.councilCoverage, "councilCoverage"),
    limitations: Array.isArray(artifact.publication?.limitations)
      ? artifact.publication.limitations
      : [],
    quality: artifact.quality,
  };
}

export function toPublicPlanningMetric(row) {
  return {
    council: row.council,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    period: {
      start: String(row.period_start),
      end: String(row.period_end),
    },
    lodgedApplications: Number(row.lodged_application_count),
    uniqueProjects: Number(row.unique_project_count),
    decisionsRecorded: Number(row.decision_recorded_count),
    activeApplications: Number(row.active_application_count),
    source: {
      key: row.source_key,
      publisher: row.source_publisher,
      url: row.source_url,
      licence: row.source_licence,
      retrievedAt: row.source_retrieved_at,
    },
    statusReferenceDate: row.status_reference_date,
    geographyScope: row.geography_scope,
    limitations: row.limitations || [],
    definitions: {
      applicationsAreDwellingCounts: false,
      decisionsAreCompletions: false,
    },
  };
}

export async function fetchPublicPlanningMetrics(sql, suburb) {
  const rows = await sql`
    SELECT *
    FROM council_planning_metrics
    WHERE LOWER(suburb) = LOWER(${suburb})
      AND state = 'VIC'
    ORDER BY period_end DESC, source_retrieved_at DESC
  `;
  return rows.map(toPublicPlanningMetric);
}
