# Melbourne Property Valuation

An open-source prototype for explainable residential property valuation in Metropolitan Melbourne.

The project focuses first on house valuations. A user enters an address, confirms the property type, and receives a first-layer desktop estimate with comparable sales, micro-location analysis, confidence scoring, and missing due-diligence checks.

## Current Scope

- Metropolitan Melbourne residential property valuation
- Phase 1 property type: house
- Comparable-sales baseline and dynamic weighting
- Street ranking and micro-location assessment
- Land, building, condition, planning, title, and risk adjustments
- Confidence scoring and missing-check disclosure
- Lead capture flow for full reports and future gated investor modules

## Prototype

This repository currently contains a static web prototype:

- `index.html`: client UI
- `styles.css`: visual styling
- `app.js`: sample valuation data and interactive behavior

Open `index.html` in a browser to run the prototype locally.

## Documentation

- `PRD.md`: product requirements
- `DATA_MODEL.md`: logical data model
- `MODEL_AUDIT_CHECKLIST.md`: valuation model audit checklist
- `CLIENT_WEB_UI.md`: client-facing web UI notes
- `requirements.md`: early requirements draft

## Why This Matters

Residential property valuation is often opaque. This project aims to make desktop estimates more explainable by showing the evidence, assumptions, comparable sales, location factors, and missing checks behind a valuation range.

The system is not intended to replace formal bank valuation, legal advice, financial advice, or licensed valuation reports. It is designed as a transparent research and workflow tool for property analysis.

## Planned Work

- Replace curated sample data with structured public-data ingestion
- Add back-testing against historical sales
- Improve comparable selection and adjustment logic
- Add title, zoning, overlay, easement, and condition verification flows
- Add model versioning and audit trails
- Expand from houses to vacant land, townhouses, villas, and apartments

