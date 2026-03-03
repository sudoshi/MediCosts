# Data Connectors (`/connectors`)

**Component:** `client/src/views/DataConnectors.jsx`
**Nav group:** AI & Data

## Purpose
Admin-facing dashboard showing the status of all external data integrations — ClearNetwork MRF crawlers, CMS data freshness, and ETL pipeline health.

## Features
- Connector status cards (last run, record count, success/error)
- ClearNetwork insurer coverage map (which plans are indexed)
- Data freshness indicators per dataset
- Manual trigger controls (admin only)

## Data Sources
- `/api/connectors/status` — connector health
- `/api/network/insurers` — indexed insurer list

## Access
Admin role required for trigger actions. Read-only status visible to all authenticated users.

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Initial build |
