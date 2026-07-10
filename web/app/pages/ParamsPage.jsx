'use client';
import { useState, useEffect, useCallback } from 'react';
import { CardPanel, Select, Spinner, EmptyState } from '@/app/components/ui';
import { BarChart } from '@/app/components/Charts';
import { useAuth } from '@/app/context/AuthContext';

function barColor(rate) {
  if (rate > 30) return '#EF4444';  // red
  if (rate > 15) return '#F59E0B';  // amber
  return '#10B981';                 // green
}

function fmt(n, decimals = 1) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : String(n);
}

export default function ParamsPage() {
  const { apiFetch, globalDateFrom, globalDateTo } = useAuth();

  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [params, setParams] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingParams, setLoadingParams] = useState(true);

  // Load agent list once
  useEffect(() => {
    setLoadingAgents(true);
    apiFetch('/api/analytics/agents')
      .then((data) => setAgents(Array.isArray(data) ? data : data.agents ?? []))
      .catch(console.error)
      .finally(() => setLoadingAgents(false));
  }, [apiFetch]);

  // Load params when agent or date filter changes
  const fetchParams = useCallback(async () => {
    setLoadingParams(true);
    setParams([]);
    
    const paramsQuery = new URLSearchParams();
    if (selectedAgent && selectedAgent !== 'all') paramsQuery.append('agent', selectedAgent);
    if (globalDateFrom) { paramsQuery.append('from', globalDateFrom); }
    if (globalDateTo)   { paramsQuery.append('to', globalDateTo + ' 23:59:59'); }
    const q = paramsQuery.toString() ? `?${paramsQuery.toString()}` : '';

    try {
      const data = await apiFetch(`/api/analytics/params${q}`);
      const list = Array.isArray(data) ? data : data.params ?? [];
      // Sort descending by failure rate
      list.sort((a, b) => Number(b.zero_pct ?? b.failure_rate ?? b.rate ?? 0) - Number(a.zero_pct ?? a.failure_rate ?? a.rate ?? 0));
      setParams(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingParams(false);
    }
  }, [apiFetch, selectedAgent, globalDateFrom, globalDateTo]);

  useEffect(() => {
    fetchParams();
  }, [fetchParams]);

  // Top 10 for the chart
  const top10 = params.slice(0, 10);
  const chartLabels = top10.map((p) => p.param_name ?? p.param ?? p.name);
  const chartData = top10.map((p) => Number(p.zero_pct ?? p.failure_rate ?? p.rate ?? 0));
  const chartColors = top10.map((p) => barColor(Number(p.zero_pct ?? p.failure_rate ?? p.rate ?? 0)));

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-text-main tracking-tight">Parameters</h1>
          <p className="text-xs text-text-muted mt-0.5">Failure rates by evaluation parameter</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-muted font-medium">Agent</span>
          <Select
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            disabled={loadingAgents}
          >
            <option value="all">All Agents</option>
            {agents.map((a, i) => {
              const name = a.agent_name || a.name || (typeof a === 'string' ? a : `agent-${i}`);
              return (
                <option key={name} value={name}>
                  {name}
                </option>
              );
            })}
          </Select>
        </div>
      </div>

      {loadingParams ? (
        <Spinner />
      ) : !params.length ? (
        <EmptyState message="No parameter data available for this selection." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Progress bars list */}
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
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color }}
                      >
                        {fmt(rate)}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(rate, 100)}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardPanel>

          {/* Top-10 horizontal bar chart */}
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
    </div>
  );
}
