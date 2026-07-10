'use client';
import { useState, useEffect, useCallback } from 'react';
import { KpiCard, CardPanel, Select, Spinner, EmptyState } from '@/app/components/ui';
import { BarChart, DoughnutChart } from '@/app/components/Charts';
import { useAuth } from '@/app/context/AuthContext';

const DIST_LABELS = ['Below 60', '60–69', '70–79', '80–89', '90–99', '100'];
const DIST_COLORS = ['#EF4444', '#F97316', '#F59E0B', '#3B82F6', '#10B981', '#7C3AED'];
const DIST_KEYS = ['below_60', 'range_60_69', 'range_70_79', 'range_80_89', 'range_90_99', 'range_100'];

function scoreAccent(avg) {
  if (avg === null || avg === undefined) return 'purple';
  if (avg >= 80) return 'green';
  if (avg >= 60) return 'amber';
  return 'red';
}

function fmt(n, decimals = 0) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : n;
}

export default function OverviewPage() {
  const { apiFetch, globalDateFrom, globalDateTo } = useAuth();

  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [summary, setSummary] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadingData, setLoadingData] = useState(true);

  // Load agent list
  useEffect(() => {
    setLoadingAgents(true);
    const qs = globalDateFrom ? `?from=${globalDateFrom}${globalDateTo ? `&to=${globalDateTo} 23:59:59` : ''}` : '';
    apiFetch(`/api/analytics/agents${qs}`)
      .then((data) => setAgents(Array.isArray(data) ? data : data.agents ?? []))
      .catch(console.error)
      .finally(() => setLoadingAgents(false));
  }, [apiFetch, globalDateFrom, globalDateTo]);

  // Load summary + distribution whenever the agent filter changes
  const fetchData = useCallback(async () => {
    setLoadingData(true);
    setSummary(null);
    setDistribution(null);
    const params = new URLSearchParams();
    if (selectedAgent && selectedAgent !== 'all') params.append('agent', selectedAgent);
    if (globalDateFrom) { params.append('from', globalDateFrom); }
    if (globalDateTo)   { params.append('to', globalDateTo + ' 23:59:59'); }
    const q = params.toString() ? `?${params.toString()}` : '';
    try {
      const [sum, dist] = await Promise.all([
        apiFetch(`/api/analytics/summary${q}`),
        apiFetch(`/api/analytics/distribution${q}`),
      ]);
      setSummary(sum);
      setDistribution(dist);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingData(false);
    }
  }, [apiFetch, selectedAgent, globalDateFrom, globalDateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Distribution chart data (6 bands)
  const distData = Array.isArray(distribution)
    ? DIST_LABELS.map((label) => {
        // match band like "100", "60-69" etc. For 'Below 60', the API might return '<60' or 'Below 60'
        const match = distribution.find((d) => d.band === label || (label === 'Below 60' && d.band.includes('60')));
        return match ? Number(match.count) : 0;
      })
    : [];

  // Doughnut data — API returns 'error_free' and 'deficient' (not error_free_calls)
  const errorFree = Number(summary?.error_free ?? 0);
  const deficient = Number(summary?.deficient ?? 0);

  // Date range label – globalDate or last 30 days
  const today = new Date();
  const prior = new Date(today);
  prior.setDate(prior.getDate() - 30);
  const fmtDate = (d) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      </div>

      {/* Body */}
      {loadingData ? (
        <Spinner />
      ) : summary ? (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KpiCard
              label="Total Calls"
              value={fmt(summary.total_calls)}
              sub="All evaluated calls"
              accent="purple"
            />
            <KpiCard
              label="Avg Score"
              value={summary.avg_score !== undefined ? `${Number(summary.avg_score).toFixed(1)}%` : '—'}
              sub="Mean quality score"
              accent={scoreAccent(Number(summary.avg_score))}
            />
            <KpiCard
              label="Error Free"
              value={fmt(summary.error_free)}
              sub={
                summary.total_calls
                  ? `${fmt((errorFree / Number(summary.total_calls)) * 100, 1)}% of total`
                  : '0% of total'
              }
              accent="green"
            />
            <KpiCard
              label="Deficient"
              value={fmt(summary.deficient)}
              sub={
                summary.total_calls
                  ? `${fmt((deficient / Number(summary.total_calls)) * 100, 1)}% of total`
                  : '0% of total'
              }
              accent="red"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardPanel title="Score Distribution">
              {distData.every((v) => v === 0) ? (
                <EmptyState message="No distribution data available." />
              ) : (
                <BarChart
                  labels={DIST_LABELS}
                  data={distData}
                  colors={DIST_COLORS}
                  height={240}
                />
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
    </div>
  );
}
