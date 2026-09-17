# Veyn BI — AI-Powered Call Center Analytics Dashboard

Multi-tenant SaaS dashboard for call center intelligence. Live on GCP serving multiple enterprise clients.

## What it does

- Ingests call transcripts and evaluations from call centers
- Runs AI-powered signal detection: threats, social media mentions, escalations, regulatory flags
- Multi-tenant: each client sees only their data (Veyn AI, Dominos Pakistan, Almosafer travel)
- AI Chat: ask questions about your call data in natural language
- Superadmin panel for managing tenants, uploading data, configuring parameters

## Live Stats

- **2,513** processed calls across tenants
- **3,572** evaluation scores ingested
- **57** unique Almosafer cases with multi-interaction trajectory analysis

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js, React, Tailwind CSS, Recharts |
| Backend | Node.js, Express |
| Database | PostgreSQL (GCP Cloud SQL) |
| AI | Google Vertex AI (Gemini) |
| Auth | JWT, role-based (admin / superadmin) |
| Infra | GCP Compute Engine, PM2 |

## Architecture

- **Multi-tenant** — `tenant_groups` + `tenants` table isolation
- **Two dashboard modes** — `standard` (call-level) and `case` (multi-interaction trajectory)
- **Signal detection** — LLM-powered tagging of calls for operational intelligence
- **REST API** — `/api/v1/` with tenant-scoped endpoints

## Clients

- **Veyn AI** — contact center QA (Logo Shoes)
- **Dominos Pakistan** — 3 portals (order taking, inbound/outbound complaints)
- **Almosafer** — travel client, Arabic + English, case-based analysis
