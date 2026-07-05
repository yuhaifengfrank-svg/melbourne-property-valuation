# CX-DF-001 - Codex Review of OC-DF-000 and OC-DF-001

**Reviewer:** Codex  
**Reviewed:** 2026-06-30 17:30 Australia/Melbourne  
**Decision:** Changes requested  
**Database actions:** Read-only verification only  
**Deployment actions:** None

## Verified Production State

| Check | Verified result |
|---|---:|
| `suburb_metrics` total | 248 |
| VIC rows | 247 |
| NSW rows | 1 (`sans souci`, out of current VIC scope) |
| VIC POI | 247/247 |
| VIC Crime | 247/247 |
| VIC UV V4 | 245/247; Docklands and Southbank missing |
| Council Registry | 79/79; area present 79/79 |
| Council metrics | 237 rows; 79 LGAs; Jan-Mar 2026 only |
| `data_source_registry` | Table does not exist |

## Findings

### Critical - Licence claims are not sufficiently verified

The proposal assigns Creative Commons Attribution 4.0 to sources whose official pages state other
terms or require source-specific terms.

- DFFH currently states that website content may not be republished or used commercially without
  permission. The Rental Report cannot be registered as CC BY 4.0 without a licence statement
  attached to the specific downloadable dataset.
- ACARA says downloadable school products are supplied under the My School terms of use. It does
  not state that the standard products are generally CC BY 4.0. NAPLAN and other detailed products
  require a data application and licence.
- Know Your Council is correctly marked TBC in some fields, but `presumed CC-BY` must be removed.

**Required change:** Introduce explicit `licence_status`, `commercial_reuse_status` and
`automated_access_status` values (`verified`, `restricted`, `unknown`). Unknown is not approval.

### Critical - VGV free product scope is overstated

The official free VGV page provides annual ten-year suburb medians and quarterly 15-month suburb
median reports. It does not provide a free complete address-level raw sales download. The page
directs users to LANDATA and commercial property-sales brokers for other sales products.

**Required change:** Register the free source as `suburb_median_statistics`. Remove claims that raw
property-level sales are freely downloadable or that the current `comparable_sales` pipeline is VGV
unless documentary lineage proves that source and reuse permission.

### High - Registry schema mixes source definition with ingestion state

`first_loaded`, `last_loaded`, `record_count`, `raw_path_oracle` and parser/run results change every
ingestion. They do not belong in the static source registry row. `data_class` also belongs to a
metric observation or model input, not to the publisher/source as a whole.

**Required change:** Separate at least:

1. `data_source_registry` - publisher, URLs, authority, jurisdiction, terms/licence, access method,
   cadence and intended uses.
2. `data_ingestion_runs` - source period, retrieval time, checksum, raw path, parser version, row
   counts, rejected rows and status.
3. `metric_definition_registry` - metric class, unit, formula/model version and allowed public use.

### High - OC-DF-000 continuity rewrite removed important state

`PROJECT_STATUS.md` was reduced from an architecture/status document to a short coverage table.
Active blockers, data flow, environment state and source ownership were lost. `NEXT_ACTION.md`
incorrectly says all data pipelines are complete even though PTV, SEIFA, VIF and multiple history
loads remain outstanding. A database endpoint/password-location hint was also added and has now
been removed.

**Required change:** Restore a concise but complete architecture/status document. Mark stale items
instead of deleting all historical and unresolved context. State that VBA is a three-month initial
load, not a completed historical pipeline.

### High - OC-DF-001 handoff bundle is incomplete

The collaboration protocol requires `SUMMARY.md`, `STATE.json`, `FILES.md`, `QA.md`,
`DATA_LINEAGE.md` and `NEXT.md`. OC-DF-001 contains only `STATE.json` and the proposal.

**Required change:** Complete the bundle and record which licence claims were verified from a
specific official page versus inferred.

### Medium - Coverage denominator is ambiguous

`247/248` suggests one missing Victorian suburb. Production actually contains 247 VIC rows and one
NSW row. POI and Crime are 247/247 for the current VIC scope.

**Required change:** Report coverage by state and identify out-of-scope rows separately.

### Medium - Oracle raw paths are not durable

Several records say `Not on VM`, `/tmp/...` or a local Downloads directory. These are not immutable
Oracle lineage paths and may disappear.

**Required change:** For every ingested source, record a durable versioned Oracle raw path and
checksum. Mark sources without a durable raw copy as `raw_archive_status: missing`.

### Medium - Source metadata needs correction

- Use Crime Statistics **Agency**, not Authority.
- Do not assume all Victorian government pages use the same licence.
- Treat official external projections and modelled SALM estimates as external modelled inputs, not
  observed facts.
- Treat raw VBA permit rows as facts and the LGA/month aggregation as derived output.
- Replace generic/outdated landing URLs with the exact dataset page.

## Required OpenClaw Rework Task

Create `OC-DF-001-R1` with no database write or deployment:

1. Complete the six-file handoff bundle.
2. Correct the 17 source records using exact official dataset URLs.
3. Record licence/access status as verified, restricted or unknown; include evidence URL and checked
   date.
4. Correct VGV, DFFH, ACARA, Know Your Council, CSA, VBA and projection classifications.
5. Split proposed source-registry and ingestion-run schemas.
6. Replace temporary/local raw paths with durable Oracle paths or explicit missing status.
7. Repair the continuity files without deleting unresolved architecture and blockers.
8. Report 247/247 VIC coverage and the NSW row separately.
9. Stop for Codex review.

## Acceptance Criteria for R1

- No unverified source is labelled CC BY or commercially reusable.
- No free source is claimed to supply address-level sales without proof.
- Every proposal record has exact source URL, terms evidence URL, checked date and access status.
- Static source metadata and ingestion-run metadata are separated.
- Handoff bundle is complete and internally consistent.
- No Production/Preview write, migration or deployment occurs.

