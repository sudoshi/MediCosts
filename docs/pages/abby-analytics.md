# Abby Analytics (`/abby`)

**Component:** `client/src/views/AbbyAnalytics.jsx`
**Nav group:** AI & Data

## Purpose
Conversational AI interface powered by Anthropic Claude. Abby can query all 12 MediCosts datasets using natural language, run multi-step tool chains, and synthesize cross-dataset insights.

## Architecture
- **Tool model:** `claude-haiku-4-5-20251001` — fast tool orchestration
- **Synthesis model:** `claude-sonnet-4-6` — final natural language response
- **Streaming:** SSE (`/api/abby/chat/stream`) with real-time tool call indicators
- **Session persistence:** `abby_sessions` + `abby_messages` tables in PostgreSQL

## Features
- Natural language queries across all datasets
- Real-time streaming response with tool call progress indicator
- Session history — saved conversations, resumable from dropdown
- Suggestion chips for new users
- Online/offline status indicator

## Tools Available to Abby (20+)
Defined in `server/lib/abby-tools.js`:
- `search_hospitals`, `get_hospital_detail`, `get_hospital_quality`
- `search_clinicians`, `get_clinician_payments`, `get_drug_prescribing`
- `get_drug_spending`, `search_drugs`
- `get_payments_summary`, `search_payments`, `get_top_payment_recipients`
- `get_post_acute_facilities`, `get_geographic_analysis`
- `get_shortage_areas`, `get_community_health`
- `get_cost_estimate`, `compare_hospitals`
- `get_financials`, `get_accountability_summary`

## Data Sources
- `POST /api/abby/chat/stream` — SSE streaming chat
- `POST /api/abby/sessions` — create session
- `GET /api/abby/sessions` — list user sessions
- `GET /api/abby/sessions/:id/messages` — load history
- `POST /api/abby/sessions/:id/messages` — save message pair
- `DELETE /api/abby/sessions/:id` — delete session

## Changelog

| Date | Change |
|------|--------|
| 2026-03-02 | Upgraded from Ollama/MedGemma to Anthropic Claude API |
| 2026-03-02 | Added native tool_use blocks + real SSE streaming |
| 2026-03-03 | Added conversation memory — session persistence in PostgreSQL, history dropdown |
