'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Select, Spinner, EmptyState } from '@/app/components/ui';
import { LineChart, BarChart, MultiAreaChart } from '@/app/components/Charts';

const PORTAL_LABELS = {
  order_taking:        'Order Taking',
  complaint_inbound:   'Complaint Inbound',
  complaint_outbound:  'Complaint Outbound',
};

export default function TrendPage() {
  const { apiFetch, globalDateFrom, globalDateTo, user } = useAuth();
  const isGroupMode = user?.dashboard_mode === 'group';

  const [activePortal, setActivePortal] = useState(
    isGroupMode ? (user?.portals?.[0]?.id || 'all') : 'all'
  );
  const [agent, setAgent] = useState('all');
  const [agents, setAgents] = useState([]);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch agent list when portal changes
  useEffect(() => {
    const params = new URLSearchParams();
    if (isGroupMode && activePortal && activePortal !== 'all') {
      params.append('forTenant', activePortal);
    }
    const qs = params.toString() ? `?${params}` : '';
    apiFetch(`/api/analytics/agents${qs}`)
      .then((data) => { setAgents(Array.isArray(data) ? data : data.agents || []); setAgent('all'); })
      .catch(() => {});
  }, [apiFetch, isGroupMode, activePortal]);

  const loadTrend = useCallback(
    async (selectedAgent) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedAgent && selectedAgent !== 'all') params.append('agent', selectedAgent);
        if (globalDateFrom) params.append('from', globalDateFrom);
        if (globalDateTo)   params.append('to', globalDateTo + ' 23:59:59');
        if (isGroupMode && activePortal && activePortal !== 'all') params.append('forTenant', activePortal);
        const qs = params.toString() ? `?${params.toString()}` : '';
        const data = await apiFetch(`/api/analytics/trend${qs}`);
        setTrend(data);
      } catch (err) {
        setError(err.message || 'Failed to load trend data.');
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, globalDateFrom, globalDateTo, isGroupMode, activePortal]
  );

  useEffect(() => {
    loadTrend(agent);
  }, [agent, loadTrend]);

  const trendList = Array.isArray(trend) ? trend : trend?.daily ?? [];
  const dateLabels = trendList.map((d) => d.date ? new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  const scoreData  = trendList.map((d) => Number(d.avgScore ?? d.avg_score ?? 0));
  const volumeData = trendList.map((d) => Number(d.total_calls ?? d.callCount ?? d.call_count ?? 0));
  const errorRateData = trendList.map((d) => {
    const total = Number(d.total_calls ?? d.callCount ?? 1);
    const deficient = Number(d.deficient ?? d.deficient_calls ?? 0);
    return total > 0 ? Math.round((deficient / total) * 100) : 0;
  });

  const combinedSeries = [
    { name: 'Avg Score', data: scoreData, color: '#8B5CF6' },
    { name: 'Error Rate %', data: errorRateData, color: '#EF4444' },
  ];

  // Label for current view
  const currentPortalLabel = isGroupMode && activePortal !== 'all'
    ? PORTAL_LABELS[(user?.portals || []).find(p => p.id === activePortal)?.portal_type] || 'Portal'
    : 'All Portals';

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Trends</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Daily performance — {currentPortalLabel}
          </p>
        </div>

        {/* Agent filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted font-medium">Agent</span>
          <Select id="trend-agent-filter" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="all">All Agents</option>
            {agents.map((a, i) => {
              const name = a.agent_name || a.name || a.id || (typeof a === 'string' ? a : `agent-${i}`);
              return <option key={name} value={name}>{name}</option>;
            })}
          </Select>
        </div>
      </div>

      {/* Group mode: portal tabs */}
      {isGroupMode && (
        <div className="flex gap-2 flex-wrap">
          {(user?.portals || []).map(p => (
            <button
              key={p.id}
              onClick={() => { setActivePortal(p.id); setAgent('all'); }}
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
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-5 py-4 text-sm text-danger">
          {error}
        </div>
      ) : !trendList || trendList.length === 0 ? (
        <EmptyState message={`No trend data for ${currentPortalLabel}. Upload data first.`} />
      ) : (
        <div className="space-y-5">
          <CardPanel title={`Score vs Error Rate — ${currentPortalLabel}`}>
            <MultiAreaChart series={combinedSeries} labels={dateLabels} height={300} />
          </CardPanel>
          <CardPanel title="Daily Call Volume">
            <div style={{ height: 280 }}>
              <BarChart labels={dateLabels} data={volumeData} colors="#3B82F6" height={280} />
            </div>
          </CardPanel>
        </div>
      )}
    </div>
  );
}
