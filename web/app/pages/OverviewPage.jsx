'use client';
import { useState, useEffect, useCallback } from 'react';
import { KpiCard, CardPanel, Select, Spinner, EmptyState } from '@/app/components/ui';
import { BarChart, DoughnutChart, RadialGauge, Sparkline } from '@/app/components/Charts';
import { useAuth } from '@/app/context/AuthContext';

// API returns "60-69" with hyphens — must match exactly
const DIST_LABELS = ['Below 60', '60-69', '70-79', '80-89', '90-99', '100'];
const DIST_LABELS_DISPLAY = ['Below 60', '60–69', '70–79', '80–89', '90–99', '100'];
const DIST_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#3B82F6', '#10B981', '#7C3AED'];

const PORTAL_LABELS = {
  order_taking:       'Order Taking',
  complaint_inbound:  'Complaint Inbound',
  complaint_outbound: 'Complaint Outbound',
};

function fmt(n, decimals = 0) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : n;
}

function scoreAccent(avg) {
  if (avg == null) return 'purple';
  if (avg >= 80) return 'green';
  if (avg >= 60) return 'amber';
  return 'red';
}

/* ── Group "All Portals" view — per-portal KPI cards ── */
function GroupOverviewView({ apiFetch, globalDateFrom, globalDateTo }) {
  const [portals, setPortals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (globalDateFrom) p.set('from', globalDateFrom);
    if (globalDateTo)   p.set('to', globalDateTo);
    apiFetch(`/api/group/overview?${p}`)
      .then(data => setPortals(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [apiFetch, globalDateFrom, globalDateTo]);

  if (loading) return <Spinner />;
  if (!portals.length) return <EmptyState message="No portal data available." />;

  const totalCalls   = portals.reduce((s, p) => s + Number(p.total_calls || 0), 0);
  const totalEF      = portals.reduce((s, p) => s + Number(p.error_free || 0), 0);
  const totalDef     = portals.reduce((s, p) => s + Number(p.deficient || 0), 0);
  const avgScore     = totalCalls > 0
    ? portals.reduce((s, p) => s + Number(p.avg_score || 0) * Number(p.total_calls || 0), 0) / totalCalls
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Consolidated KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="sm:col-span-1 rounded-2xl border border-border bg-surface p-5 flex flex-col items-center justify-center gap-1">
          <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-1">Avg Score</div>
          <RadialGauge value={avgScore ?? 0} label="Quality" size={160} />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
          <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Total Calls</div>
          <div className="text-3xl font-bold text-text-main">{totalCalls.toLocaleString()}</div>
          <div className="text-xs text-text-muted">Across all portals</div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
          <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Error Free</div>
          <div className="text-3xl font-bold text-green-400">{totalEF.toLocaleString()}</div>
          <div className="text-xs text-text-muted">
            {totalCalls ? `${((totalEF / totalCalls) * 100).toFixed(1)}% of total` : '0% of total'}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3">
          <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Deficient</div>
          <div className="text-3xl font-bold text-red-400">{totalDef.toLocaleString()}</div>
          <div className="text-xs text-text-muted">
            {totalCalls ? `${((totalDef / totalCalls) * 100).toFixed(1)}% of total` : '0% of total'}
          </div>
        </div>
      </div>

      {/* Per-portal breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {portals.map(p => {
          const ef  = Number(p.error_free || 0);
          const def = Number(p.deficient || 0);
          const tot = Number(p.total_calls || 0);
          const avg = Number(p.avg_score || 0);
          const avgColor = avg >= 80 ? '#22C55E' : avg >= 60 ? '#F59E0B' : '#EF4444';
          return (
            <CardPanel key={p.id} title={PORTAL_LABELS[p.portal_type] || p.name}>
              <div className="space-y-3 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Total Calls</span>
                  <span className="text-lg font-bold text-text-main">{tot.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Avg Score</span>
                  <span className="text-lg font-bold" style={{ color: avgColor }}>{avg.toFixed(1)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Error Free</span>
                  <span className="text-sm font-semibold text-green-400">{ef} ({tot ? ((ef/tot)*100).toFixed(0) : 0}%)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">Deficient</span>
                  <span className="text-sm font-semibold text-red-400">{def} ({tot ? ((def/tot)*100).toFixed(0) : 0}%)</span>
                </div>
                {/* Error Free progress bar */}
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-green-400 transition-all duration-700"
                    style={{ width: `${tot ? Math.round((ef/tot)*100) : 0}%` }} />
                </div>
              </div>
            </CardPanel>
          );
        })}
      </div>
    </div>
  );
}

/* ── Single portal / non-group view ── */
function SingleOverviewView({ apiFetch, globalDateFrom, globalDateTo, forTenant }) {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [summary, setSummary] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    setLoadingAgents(true);
    setSelectedAgent('all');
    const p = new URLSearchParams();
    if (globalDateFrom) p.set('from', globalDateFrom);
    if (globalDateTo)   p.set('to', globalDateTo + ' 23:59:59');
    if (forTenant)      p.set('forTenant', forTenant);
    apiFetch(`/api/analytics/agents?${p}`)
      .then(data => setAgents(Array.isArray(data) ? data : data.agents ?? []))
      .catch(console.error)
      .finally(() => setLoadingAgents(false));
  }, [apiFetch, globalDateFrom, globalDateTo, forTenant]);

  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setSummary(null);
    setDistribution(null);
    const p = new URLSearchParams();
    if (selectedAgent && selectedAgent !== 'all') p.append('agent', selectedAgent);
    if (globalDateFrom) p.append('from', globalDateFrom);
    if (globalDateTo)   p.append('to', globalDateTo + ' 23:59:59');
    if (forTenant)      p.append('forTenant', forTenant);
    const q = p.toString() ? `?${p}` : '';
    try {
      const [sum, dist, trend] = await Promise.all([
        apiFetch(`/api/analytics/summary${q}`),
        apiFetch(`/api/analytics/distribution${q}`),
        apiFetch(`/api/analytics/trend${q}`).catch(() => []),
      ]);
      setSummary(sum);
      setDistribution(dist);
      setTrendData(Array.isArray(trend) ? trend : trend?.daily ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }, [apiFetch, selectedAgent, globalDateFrom, globalDateTo, forTenant]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Distribution: match API band strings exactly (hyphens, not en-dashes)
  const distData = Array.isArray(distribution)
    ? DIST_LABELS.map(label => {
        const match = distribution.find(d => d.band === label);
        return match ? Number(match.count) : 0;
      })
    : [];

  const errorFree = Number(summary?.error_free ?? 0);
  const deficient = Number(summary?.deficient ?? 0);
  const sparkScores = trendData.slice(-14).map(d => Number(d.avg_score ?? d.avgScore ?? 0));
  const sparkVolume = trendData.slice(-14).map(d => Number(d.total_calls ?? d.callCount ?? 0));
  const avgScore = summary?.avg_score != null ? Number(summary.avg_score) : null;

  return (
    <>
      {/* Agent filter */}
      <div className="flex items-center gap-3 justify-end">
        <span className="text-xs text-text-muted font-medium">Agent</span>
        <Select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} disabled={loadingAgents}>
          <option value="all">All Agents</option>
          {agents.map((a, i) => {
            const name = a.agent_name || a.name || (typeof a === 'string' ? a : `agent-${i}`);
            return <option key={name} value={name}>{name}</option>;
          })}
        </Select>
      </div>

      {loadingData ? <Spinner /> : summary ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-1 rounded-2xl border border-border bg-surface p-5 flex flex-col items-center justify-center gap-1">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-1">Avg Score</div>
              <RadialGauge value={avgScore ?? 0} label="Quality" size={160} />
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3 hover:border-border2 transition-colors">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Total Calls</div>
              <div className="text-3xl font-bold text-text-main">{fmt(summary.total_calls)}</div>
              <div className="text-xs text-text-muted">All evaluated calls</div>
              <div className="-mx-1 -mb-2 mt-auto"><Sparkline data={sparkVolume} color="#8B5CF6" height={44} /></div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3 hover:border-border2 transition-colors">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Error Free</div>
              <div className="text-3xl font-bold text-green-400">{fmt(summary.error_free)}</div>
              <div className="text-xs text-text-muted">
                {summary.total_calls ? `${fmt((errorFree / Number(summary.total_calls)) * 100, 1)}% of total` : '0% of total'}
              </div>
              <div className="-mx-1 -mb-2 mt-auto"><Sparkline data={sparkScores} color="#22C55E" height={44} /></div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-3 hover:border-border2 transition-colors">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold">Deficient</div>
              <div className="text-3xl font-bold text-red-400">{fmt(summary.deficient)}</div>
              <div className="text-xs text-text-muted">
                {summary.total_calls ? `${fmt((deficient / Number(summary.total_calls)) * 100, 1)}% of total` : '0% of total'}
              </div>
              <div className="mt-auto pt-2">
                <div className="h-2 rounded-full bg-border overflow-hidden">
                  <div className="h-full rounded-full bg-red-400 transition-all duration-700"
                    style={{ width: `${summary.total_calls ? Math.round((deficient / Number(summary.total_calls)) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardPanel title="Score Distribution">
              {distData.every(v => v === 0) ? (
                <EmptyState message="No distribution data available." />
              ) : (
                <BarChart labels={DIST_LABELS_DISPLAY} data={distData} colors={DIST_COLORS} height={240} />
              )}
            </CardPanel>
            <CardPanel title="Call Status Breakdown">
              {errorFree === 0 && deficient === 0 ? (
                <EmptyState message="No call data available." />
              ) : (
                <DoughnutChart
                  labels={['Error Free', 'Deficient']}
                  data={[errorFree, deficient]}
                  colors={['#10B981', '#EF4444']}
                  height={240}
                />
              )}
            </CardPanel>
          </div>
        </>
      ) : (
        <EmptyState message="No data available. Try a different agent or date range." />
      )}
    </>
  );
}

/* ── Main page ── */
export default function OverviewPage() {
  const { apiFetch, globalDateFrom, globalDateTo, user } = useAuth();
  const isGroupMode = user?.dashboard_mode === 'group';

  const [activePortal, setActivePortal] = useState(null); // null = All Portals

  const today = new Date();
  const prior = new Date(today);
  prior.setDate(prior.getDate() - 30);
  const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const dateRangeLabel = globalDateFrom && globalDateTo
    ? `${fmtDate(new Date(globalDateFrom + 'T12:00:00'))} – ${fmtDate(new Date(globalDateTo + 'T12:00:00'))}`
    : globalDateFrom
    ? `From ${fmtDate(new Date(globalDateFrom + 'T12:00:00'))}`
    : `${fmtDate(prior)} – ${fmtDate(today)}`;

  return (
    <div className="flex flex-col gap-6 min-h-full">
      {/* Sticky page header */}
      <div className="sticky top-0 z-10 bg-bg/80 backdrop-blur-md border-b border-border pb-4 pt-1 -mx-6 px-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-text-main tracking-tight">Overview</h1>
            <p className="text-xs text-text-muted mt-0.5">{dateRangeLabel}</p>
          </div>
        </div>
      </div>

      {/* Group: portal tabs */}
      {isGroupMode && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActivePortal(null)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activePortal === null ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-border2'
            }`}
          >
            All Portals
          </button>
          {(user?.portals || []).map(p => (
            <button
              key={p.id}
              onClick={() => setActivePortal(p.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                activePortal === p.id ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-border2'
              }`}
            >
              {PORTAL_LABELS[p.portal_type] || p.name}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isGroupMode && activePortal === null ? (
        <GroupOverviewView apiFetch={apiFetch} globalDateFrom={globalDateFrom} globalDateTo={globalDateTo} />
      ) : (
        <SingleOverviewView
          apiFetch={apiFetch}
          globalDateFrom={globalDateFrom}
          globalDateTo={globalDateTo}
          forTenant={isGroupMode ? activePortal : null}
        />
      )}
    </div>
  );
}
