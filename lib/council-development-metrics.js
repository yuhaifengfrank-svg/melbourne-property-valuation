const COUNT_FIELDS = [
  "totalProjectCount",
  "appliedProjectCount",
  "approvedProjectCount",
  "underConstructionProjectCount",
  "completedProjectCount",
  "activeProjectCount",
  "activeResidentialProjectCount",
  "activeResidentialDwellingCount",
  "planningReferenceCount",
];

function requiredText(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field} is required`);
  return text;
}

export function normalizeDevelopmentMetricArtifact(artifact) {
  if (!artifact || artifact.schemaVersion !== "development-activity-summary-v1") {
    throw new Error("Unsupported development metric artifact");
  }
  if (artifact.publication?.publishable !== true) {
    throw new Error("Development metric artifact is not publishable");
  }

  const summary = artifact.summary || {};
  for (const field of COUNT_FIELDS) {
    if (!Number.isInteger(summary[field]) || summary[field] < 0) {
      throw new Error(`${field} must be a non-negative integer`);
    }
  }
  const statusTotal = summary.appliedProjectCount
    + summary.approvedProjectCount
    + summary.underConstructionProjectCount
    + summary.completedProjectCount;
  if (statusTotal !== summary.totalProjectCount
    || summary.activeProjectCount !== statusTotal - summary.completedProjectCount
    || summary.activeResidentialProjectCount > summary.activeProjectCount
    || summary.planningReferenceCount > summary.totalProjectCount) {
    throw new Error("Development activity counts are inconsistent");
  }

  const sourceRows = Number(artifact.quality?.sourceRows);
  const accountedRows = Number(artifact.quality?.allSourceRowsAccountedFor);
  if (!Number.isInteger(sourceRows) || sourceRows <= 0 || sourceRows !== accountedRows) {
    throw new Error("Development source row reconciliation failed");
  }

  return {
    council: requiredText(artifact.geography?.council, "council"),
    suburb: requiredText(artifact.geography?.suburb, "suburb").toLowerCase(),
    state: "VIC",
    postcode: requiredText(artifact.geography?.postcode, "postcode"),
    snapshotAt: requiredText(artifact.source?.dataProcessedAt, "source.dataProcessedAt"),
    ...Object.fromEntries(COUNT_FIELDS.map((field) => [field, summary[field]])),
    sourceKey: requiredText(artifact.source?.key, "source.key"),
    sourcePublisher: requiredText(artifact.source?.publisher, "source.publisher"),
    sourceUrl: requiredText(artifact.source?.url, "source.url"),
    sourceLicence: String(artifact.source?.licence ?? "").trim() || null,
    geographyScope: requiredText(artifact.geography?.scope, "geography.scope"),
    limitations: Array.isArray(artifact.publication?.limitations)
      ? artifact.publication.limitations
      : [],
    quality: artifact.quality,
  };
}

export function toPublicDevelopmentMetric(row) {
  return {
    council: row.council,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    snapshotAt: row.snapshot_at,
    projects: {
      total: Number(row.total_project_count),
      active: Number(row.active_project_count),
      applied: Number(row.applied_project_count),
      approved: Number(row.approved_project_count),
      underConstruction: Number(row.under_construction_project_count),
      completed: Number(row.completed_project_count),
      withPlanningReference: Number(row.planning_reference_count),
    },
    residentialPipeline: {
      activeProjects: Number(row.active_residential_project_count),
      statedDwellings: Number(row.active_residential_dwelling_count),
    },
    source: {
      key: row.source_key,
      publisher: row.source_publisher,
      url: row.source_url,
      licence: row.source_licence,
    },
    geographyScope: row.geography_scope,
    limitations: row.limitations || [],
    definitions: {
      majorDevelopmentsOnly: true,
      projectCapacityIsApproval: false,
      projectCapacityIsCompletion: false,
    },
  };
}

export async function fetchPublicDevelopmentMetrics(sql, suburb) {
  const rows = await sql`
    SELECT *
    FROM council_development_metrics
    WHERE LOWER(suburb) = LOWER(${suburb})
      AND state = 'VIC'
    ORDER BY snapshot_at DESC
  `;
  return rows.map(toPublicDevelopmentMetric);
}
