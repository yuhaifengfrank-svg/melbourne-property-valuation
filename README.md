# Melbourne Property Valuation

An open-source prototype for explainable residential property valuation in Metropolitan Melbourne.

The project focuses first on house valuations. A user enters an address, confirms the property type, and receives a first-layer desktop estimate with comparable sales, micro-location analysis, confidence scoring, and missing due-diligence checks.

## Current Scope

- Australia-wide address intake with current demo samples focused on Victoria
- Residential property valuation across house, vacant land, townhouse, villa, unit and apartment samples
- Comparable-sales baseline and dynamic weighting
- Street ranking and micro-location assessment
- Land, building, condition, planning, title, and risk adjustments
- Confidence scoring and missing-check disclosure
- Lead capture flow for full reports and future gated investor modules

## Data Source Policy

The model uses an authority-first source hierarchy:

- Layer 1: free authoritative public data, including ABS Census / QuickStats / DataPacks / SEIFA, RBA/APRA statistics, state planning records, VicPlan, LANDATA/Land Use Victoria, council planning registers and public maps.
- Layer 2: commercial or market-published data, including portals, agent sold results, auction results, rental listings and market reports.
- Layer 3: cross-check and confirmation. Non-authoritative market data should be cross-checked across at least three independent sources, with five or more sources preferred for higher confidence. Title, council, planning and government records override portal conflicts.

The current market-source cross-check module generates a weighted public evidence queue and direct public check links for sources such as realestate.com.au, Domain, agent results, property.com.au, AVM/profile pages, secondary portals, rental evidence and local market reports. It does not bypass portal controls or scrape restricted data. Live price extraction should use authorised APIs, licensed data feeds or workflows that respect each source's terms and robots policy.

## Prototype

This repository contains a static client interface plus a Vercel serverless lead-capture API:

- `index.html`: client UI
- `styles.css`: visual styling
- `app.js`: sample valuation data and interactive behavior
- `api/leads.js`: PostgreSQL-backed lead capture and admin API
- `admin.html`: private lead analysis dashboard

Open `index.html` in a browser to run the prototype locally.

## Deployment Environment

The Vercel deployment requires:

- `DATABASE_URL`: PostgreSQL connection string, typically provided by a Neon integration
- `ADMIN_KEY`: private key used to open the lead analysis dashboard
- `IP_HASH_SALT`: optional private salt used when hashing visitor IP addresses

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
- Add ABS Census / DataPacks / SEIFA ingestion for suburb fundamentals
- Add back-testing against historical sales
- Improve comparable selection and adjustment logic
- Add title, zoning, overlay, easement, and condition verification flows
- Add model versioning and audit trails
- Expand from houses to vacant land, townhouses, villas, and apartments
