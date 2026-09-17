'use client';
import { useState, useEffect, useCallback } from 'react';
import { CardPanel, Select, Spinner, EmptyState } from '@/app/components/ui';
import { BarChart } from '@/app/components/Charts';
import { useAuth } from '@/app/context/AuthContext';

function barColor(rate) {
  if (rate > 30) return '#EF4444';
  if (rate > 15) return '#F59E0B';
  return '#10B981';
}

function fmt(n, decimals = 1) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : String(n);
}

const PORTAL_LABELS = {
  order_taking:       'Order Taking',
  complaint_inbound:  'Complaint Inbound',
  complaint_outbound: 'Complaint Outbound',
};

function scoreColor(s) {
  const n = parseFloat(s);
  if (!n) return 'text-text-muted';
  if (n >= 80) return 'text-emerald-400';
  if (n >= 60) return 'text-amber-400';
  return 'text-red-400';
}

/* ─── Group: "All Portals" scorecard view (score %, not failure rate) ── */
function GroupScorecardView({ apiFetch, globalDateFrom, globalDateTo }) {
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (globalDateFrom) p.set('from', globalDateFrom);
    if (globalDateTo)   p.set('to', globalDateTo);
    const qs = p.toString() ? `?${p}` : '';
    apiFetch(`/api/group/scorecards${qs}`)
      .then(data => setScorecards(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, globalDateFrom, globalDateTo]);

  if (loading) return <Spinner />;
  if (!scorecards.length) return <EmptyState message="No scorecard data available." />;

  return (
    <div className="flex flex-col gap-6">
      {scorecards.map(sc => {
        const label = PORTAL_LABELS[sc.portal_type] || sc.name;
        if (!sc.parameters?.length) return null;
        return (
          <CardPanel key={sc.id} title={`${label} — Parameter Scores`}>
            <div className="flex flex-col gap-3 mt-2">
              {sc.parameters.map((p, i) => {
                const pct = parseFloat(p.pct) || 0;
                return (
                  <div key={`${p.param_name}-${i}`} className="group">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-text-label font-medium truncate max-w-[75%]">
                        {p.param_name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-text-muted">{fmt(p.avg_score, 1)} avg</span>
                        <span className={`text-xs font-bold tabular-nums ${scoreColor(pct)}`}>
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          backgroundColor: pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardPanel>
        );
      })}
    </div>
  );
}

/* ─── Single-portal: failure rate view ───────────────────────────────── */
function PortalParamsView({ apiFetch, globalDateFrom, globalDateTo, forTenant, agents }) {
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [params, setParams] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchParams = useCallback(async () => {
    setLoading(true);
    setParams([]);
    const p = new URLSearchParams();
    if (selectedAgent && selectedAgent !== 'all') p.append('agent', selectedAgent);
    if (globalDateFrom) p.append('from', globalDateFrom);
    if (globalDateTo)   p.append('to', globalDateTo + ' 23:59:59');
    if (forTenant)      p.append('forTenant', forTenant);
    const q = p.toString() ? `?${p}` : '';
    try {
      const data = await apiFetch(`/api/analytics/params${q}`);
      const list = Array.isArray(data) ? data : data.params ?? [];
      list.sort((a, b) => Number(b.zero_pct ?? b.failure_rate ?? b.rate ?? 0) - Number(a.zero_pct ?? a.failure_rate ?? a.rate ?? 0));
      setParams(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, selectedAgent, globalDateFrom, globalDateTo, forTenant]);

  useEffect(() => { fetchParams(); }, [fetchParams]);

  const top10       = params.slice(0, 10);
  const chartLabels = top10.map(p => p.param_name ?? p.param ?? p.name);
  const chartData   = top10.map(p => Number(p.zero_pct ?? p.failure_rate ?? p.rate ?? 0));
  const chartColors = top10.map(p => barColor(Number(p.zero_pct ?? p.failure_rate ?? p.rate ?? 0)));

  return (
    <>
      <div className="flex items-center gap-3 justify-end">
        <span className="text-xs text-text-muted font-medium">Agent</span>
        <Select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)}>
          <option value="all">All Agents</option>
          {(agents || []).map((a, i) => {
            const name = a.agent_name || a.name || (typeof a === 'string' ? a : `agent-${i}`);
            return <option key={name} value={name}>{name}</option>;
          })}
        </Select>
      </div>

      {loading ? (
        <Spinner />
      ) : !params.length ? (
        <EmptyState message="No parameter data available for this selection." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <CardPanel title="All Failing Parameters" className="self-start">
            <div className="flex flex-col gap-3">
              {params.map((p, i) => {
                const name = p.param_name ?? p.param ?? p.name ?? `param-${i}`;
                const rate = Number(p.zero_pct ?? p.failure_rate ?? p.rate ?? 0);
                const color = barColor(rate);
                return (
                  <div key={`${name}-${i}`} className="group">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-text-label font-medium group-hover:text-text-main transition-colors duration-150 truncate max-w-[75%]">
                        {name}
                      </span>
                      <span className="text-xs font-bold tabular-nums" style={{ color }}>
                        {fmt(rate)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(rate, 100)}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardPanel>

          <CardPanel title="Top 10 Failing Parameters">
            {top10.length === 0 ? (
              <EmptyState message="No data." />
            ) : (
              <BarChart
                labels={chartLabels}
                data={chartData}
                colors={chartColors}
                height={Math.max(260, top10.length * 36)}
                horizontal={true}
              />
            )}
          </CardPanel>
        </div>
      )}
    </>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function ParamsPage() {
  const { apiFetch, globalDateFrom, globalDateTo, user } = useAuth();
  const isGroupMode = user?.dashboard_mode === 'group';

  const [activePortal, setActivePortal] = useState(null); // null = All Portals
  const [portalAgents, setPortalAgents] = useState([]);
  const [singleAgents, setSingleAgents] = useState([]);

  // Load agents when a specific portal tab is active
  useEffect(() => {
    if (!activePortal) { setPortalAgents([]); return; }
    const p = new URLSearchParams();
    p.set('forTenant', activePortal);
    apiFetch(`/api/analytics/agents?${p}`)
      .then(data => setPortalAgents(Array.isArray(data) ? data : data.agents ?? []))
      .catch(console.error);
  }, [apiFetch, activePortal]);

  // Non-group: load agents normally
  useEffect(() => {
    if (isGroupMode) return;
    apiFetch('/api/analytics/agents')
      .then(data => setSingleAgents(Array.isArray(data) ? data : data.agents ?? []))
      .catch(console.error);
  }, [apiFetch, isGroupMode]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-text-main tracking-tight">Scorecards</h1>
        <p className="text-xs text-text-muted mt-0.5">
          {isGroupMode ? 'Parameter performance across portals' : 'Failure rates by evaluation parameter'}
        </p>
      </div>

      {/* Group: portal tabs */}
      {isGroupMode && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActivePortal(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activePortal === null
                ? 'bg-primary text-white border-primary'
                : 'border-border text-text-muted hover:border-border2'
            }`}
          >
            All Portals
          </button>
          {(user?.portals || []).map(p => (
            <button
              key={p.id}
              onClick={() => setActivePortal(p.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                activePortal === p.id
                  ? 'bg-primary text-white border-primary'
                  : 'border-border text-text-muted hover:border-border2'
              }`}
            >
              {PORTAL_LABELS[p.portal_type] || p.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isGroupMode ? (
        activePortal === null ? (
          <GroupScorecardView
            apiFetch={apiFetch}
            globalDateFrom={globalDateFrom}
            globalDateTo={globalDateTo}
          />
        ) : (
          <PortalParamsView
            apiFetch={apiFetch}
            globalDateFrom={globalDateFrom}
            globalDateTo={globalDateTo}
            forTenant={activePortal}
            agents={portalAgents}
          />
        )
      ) : (
        <PortalParamsView
          apiFetch={apiFetch}
          globalDateFrom={globalDateFrom}
          globalDateTo={globalDateTo}
          forTenant={null}
          agents={singleAgents}
        />
      )}
    </div>
  );
}
