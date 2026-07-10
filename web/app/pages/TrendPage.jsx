'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Select, Spinner, EmptyState } from '@/app/components/ui';
import { LineChart, BarChart } from '@/app/components/Charts';

export default function TrendPage() {
  const { apiFetch, globalDateFrom, globalDateTo } = useAuth();
  const [agent, setAgent] = useState('all');
  const [agents, setAgents] = useState([]);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch agent list once on mount
  useEffect(() => {
    apiFetch('/api/analytics/agents')
      .then((data) => setAgents(Array.isArray(data) ? data : data.agents || []))
      .catch(() => {}); // non-critical
  }, [apiFetch]);

  const loadTrend = useCallback(
    async (selectedAgent) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedAgent && selectedAgent !== 'all') params.append('agent', selectedAgent);
        if (globalDateFrom) { params.append('from', globalDateFrom); }
        if (globalDateTo)   { params.append('to', globalDateTo + ' 23:59:59'); }
        const qs = params.toString() ? `?${params.toString()}` : '';
        const data = await apiFetch(`/api/analytics/trend${qs}`);
        setTrend(data);
      } catch (err) {
        setError(err.message || 'Failed to load trend data.');
      } finally {
        setLoading(false);
      }
    },
    [apiFetch, globalDateFrom, globalDateTo]
  );

  useEffect(() => {
    loadTrend(agent);
  }, [agent, loadTrend]);

  const trendList = Array.isArray(trend) ? trend : trend?.daily ?? [];
  const scoreLabels = trendList.map((d) => d.date ? new Date(d.date).toLocaleDateString() : '');
  const scoreData = trendList.map((d) => Number(d.avgScore ?? d.avg_score ?? 0));
  const volumeLabels = trendList.map((d) => d.date ? new Date(d.date).toLocaleDateString() : '');
  const volumeData = trendList.map((d) => Number(d.total_calls ?? d.callCount ?? d.call_count ?? 0));

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Trends</h1>
          <p className="text-sm text-text-muted mt-0.5">Daily performance overview by agent</p>
        </div>

        {/* Agent filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted font-medium">Agent</span>
          <Select
            id="trend-agent-filter"
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
          >
            <option value="all">All Agents</option>
            {agents.map((a, i) => {
              const name = a.agent_name || a.name || a.id || (typeof a === 'string' ? a : `agent-${i}`);
              return (
                <option key={name} value={name}>
                  {name}
                </option>
              );
            })}
          </Select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-5 py-4 text-sm text-danger">
          {error}
        </div>
      ) : !trendList || trendList.length === 0 ? (
        <EmptyState message="No trend data available for the selected agent." />
      ) : (
        <div className="space-y-5">
          {/* Score line chart */}
          <CardPanel title="Daily Average Score">
            <div style={{ height: 280 }}>
              <LineChart
                labels={scoreLabels}
                data={scoreData}
                height={280}
                minY={60}
              />
            </div>
          </CardPanel>

          {/* Volume bar chart */}
          <CardPanel title="Daily Call Volume">
            <div style={{ height: 280 }}>
              <BarChart
                labels={volumeLabels}
                data={volumeData}
                colors="#3B82F6"
                height={280}
              />
            </div>
          </CardPanel>
        </div>
      )}
    </div>
  );
}
