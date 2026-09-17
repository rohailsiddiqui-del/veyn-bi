@AGENTS.md

# Veyn BI — Next.js Web App Context

## Project
- **Path:** `D:\Openclaw work\workspace\veyn-bi\web\`
- **Stack:** Next.js (App Router) + Tailwind CSS v4 + Chart.js
- **Dev server:** `npm run dev` → `http://localhost:3000`
- **API:** `http://34.27.148.238:4000`
- **Login:** `admin@logoshoes.com` / `test123`

## Key Files
- `app/context/AuthContext.jsx` — JWT auth, `apiFetch()` helper, token storage
- `app/components/ui.jsx` — KpiCard, CardPanel, Badge, Button, Spinner, Select, EmptyState
- `app/components/Charts.jsx` — BarChart, DoughnutChart, LineChart (Chart.js wrappers)
- `app/pages/` — OverviewPage, AgentsPage, ParamsPage, TrendPage, InsightsPage, ChatPage, UploadPage

## CRITICAL: API Schema Rules
**All Postgres numeric values come back as STRINGS. Always use Number() before arithmetic.**

| Endpoint | Key Fields |
|---|---|
| `/api/analytics/agents` | `agent_name`, `total_calls`(str), `avg_score`(str), `error_free`(str), `deficient`(str), `avg_duration_min`(str) |
| `/api/analytics/summary` | `total_calls`, `avg_score`, `error_free`, `deficient` — NOT `error_free_calls`/`deficient_calls` |
| `/api/analytics/distribution` | Array of `{ band, count }` — NOT an object with keys |
| `/api/analytics/trend` | Raw array (NOT `{ daily: [] }` wrapper), `total_calls` for volume |
| `/api/analytics/params` | `param_name` (NOT `name`), `zero_pct` (NOT `failure_rate`) |
| `/api/insights/summary` | `total_analysed`, `success_count`, `threat_calls`, `social_media_calls`, `escalation_calls`, `regulatory_calls`, `positive_calls`, `negative_calls`, `avg_customer_sentiment`(-1..1), `avg_customer_talk_pct` |
| `/api/insights/sentiment-by-agent` | `agent_name`, `avg_customer_sentiment` (null or -1..1, normalize to 0..100 by `* 100 + 50`) |
| `/api/insights/locations` | `location`, `call_count` (NOT `count`) |
| `/api/insights/products` | `product`, `frequency` (NOT `count`) |

## CRITICAL: Chart.js Height Fix
Chart.js with `maintainAspectRatio: false` requires a `position: relative` parent div with explicit height.
**ALWAYS wrap canvas in:**
```jsx
<div style={{ position: 'relative', height: height, width: '100%' }}>
  <canvas ref={ref} />
</div>
```
Without this, charts grow infinitely downward on every resize.

## CRITICAL: React Key Prop
When mapping arrays with potentially duplicate names, always use:
```jsx
key={`${name}-${index}`}
```
Never use just `key={name}` when names may be non-unique or undefined.

## Known Missing API Fields
These are NOT returned by the current backend (show EmptyState, don't crash):
- `sentimentDistribution` in `/api/insights/summary`
- `outcomes` in `/api/insights/summary`

## CRITICAL: Global Date Filter
- The system uses a global date filter spanning the entire dashboard.
- Frontend must maintain `globalDate` in a global context (e.g., `AuthContext`) and pass `from` and `to` (end of day) query parameters to **all** analytics and insights API calls.
- The date picker should live in the global layout/header, not inside individual page components, so selecting a date shifts the entire system context simultaneously.
