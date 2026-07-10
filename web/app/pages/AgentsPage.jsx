'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { CardPanel, Badge, Button, Spinner, EmptyState } from '@/app/components/ui';
import { BarChart } from '@/app/components/Charts';
import { useAuth } from '@/app/context/AuthContext';

function scoreVariant(score) {
  const s = Number(score);
  if (s >= 80) return 'success';
  if (s >= 60) return 'warning';
  return 'danger';
}

function severityColor(rate) {
  if (rate > 30) return '#EF4444';
  if (rate > 15) return '#F97316';
  return '#F59E0B';
}

function fmtDur(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmt(n, decimals = 0) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(decimals) : n;
}

/* ─── Coaching panel ─────────────────────────────────────────────────── */
function CoachingPanel({ agentName, apiFetch, globalDate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = globalDate ? `?from=${globalDate}&to=${globalDate} 23:59:59` : '';
    apiFetch(`/api/analytics/agents/${encodeURIComponent(agentName)}/coaching${qs}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [agentName, apiFetch, globalDate]);

  if (loading) return <div className="px-4 pb-4"><Spinner /></div>;
  if (error) return <div className="px-4 pb-4 text-danger text-xs">{error}</div>;

  const params = data?.failing_params ?? data?.params ?? [];
  if (!params.length) {
    return (
      <div className="px-4 pb-4">
        <EmptyState message="No failing parameters found – great job!" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-5">
      <div className="text-xs font-semibold text-text-label uppercase tracking-widest mb-3">
        Failing Parameters
      </div>
      <div className="flex flex-col gap-2.5">
        {params.map((p, i) => {
          const name = p.param_name ?? p.param ?? p.name ?? `param-${i}`;
          const rate = Number(p.zero_pct ?? p.failure_rate ?? p.rate ?? 0);
          const color = severityColor(rate);
          return (
            <div key={`${name}-${i}`}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-label font-medium">{name}</span>
                <span style={{ color }} className="font-semibold">{fmt(rate, 1)}%</span>
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
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function AgentsPage() {
  const { apiFetch, globalDate } = useAuth();

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [deletingAgent, setDeletingAgent] = useState(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const qs = globalDate ? `?from=${globalDate}&to=${globalDate} 23:59:59` : '';
      const data = await apiFetch(`/api/analytics/agents${qs}`);
      setAgents(Array.isArray(data) ? data : data.agents ?? []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, globalDate]);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const handleDelete = useCallback(
    async (agentName, e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete agent "${agentName}" and all their data? This cannot be undone.`)) return;
      setDeletingAgent(agentName);
      try {
        await apiFetch(`/api/analytics/agents/${encodeURIComponent(agentName)}`, {
          method: 'DELETE',
        });
        if (expandedAgent === agentName) setExpandedAgent(null);
        await loadAgents();
      } catch (err) {
        alert(`Failed to delete agent: ${err.message}`);
      } finally {
        setDeletingAgent(null);
      }
    },
    [apiFetch, loadAgents, expandedAgent]
  );

  const toggleExpand = (agentName) => {
    setExpandedAgent((prev) => (prev === agentName ? null : agentName));
  };

  if (loading) return <Spinner />;
  if (!agents.length) return <EmptyState message="No agents found." />;

  // Chart data — coerce strings to numbers
  const agentNames = agents.map((a) => a.agent_name || a.name || (typeof a === 'string' ? a : 'Unknown'));
  const avgScores = agents.map((a) => Number(a.avg_score ?? 0));
  const callVolumes = agents.map((a) => Number(a.total_calls ?? 0));

  return (
    <div className="flex flex-col gap-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-text-main tracking-tight">Agents</h1>
        <p className="text-xs text-text-muted mt-0.5">Performance overview for all agents</p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardPanel title="Avg Score by Agent">
          <BarChart
            labels={agentNames}
            data={avgScores}
            colors="#A78BFA"
            height={220}
            options={{ min: 60 }}
          />
        </CardPanel>
        <CardPanel title="Call Volume by Agent">
          <BarChart
            labels={agentNames}
            data={callVolumes}
            colors="#3B82F6"
            height={220}
          />
        </CardPanel>
      </div>

      {/* Leaderboard */}
      <CardPanel title="Leaderboard">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                {['#', 'Agent', 'Calls', 'Avg Score', 'Error Free', 'Deficient', 'Avg Duration', 'Coaching', ''].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider py-2 px-3 first:pl-0 last:pr-0"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, idx) => {
                const name = agent.agent_name || agent.name || (typeof agent === 'string' ? agent : `agent-${idx}`);
                const isExpanded = expandedAgent === name;
                const isDeleting = deletingAgent === name;

                return (
                  <Fragment key={name}>
                    <tr
                      key={name}
                      onClick={() => toggleExpand(name)}
                      className={`border-b border-border/50 cursor-pointer transition-colors duration-150 hover:bg-surface2 ${
                        isExpanded ? 'bg-surface2' : ''
                      }`}
                    >
                      <td className="py-3 px-3 pl-0 text-text-muted font-semibold text-xs">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-3 font-semibold text-text-main whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary-soft text-xs font-bold shrink-0">
                            {name.charAt(0).toUpperCase()}
                          </div>
                          {name}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-text-label">{agent.total_calls ?? '—'}</td>
                      <td className="py-3 px-3">
                        {agent.avg_score !== undefined ? (
                          <Badge variant={scoreVariant(agent.avg_score)}>
                            {Number(agent.avg_score).toFixed(1)}%
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-success font-semibold">
                        {agent.error_free ?? '—'}
                      </td>
                      <td className="py-3 px-3 text-danger font-semibold">
                        {agent.deficient ?? '—'}
                      </td>
                      <td className="py-3 px-3 text-text-label">
                        {agent.avg_duration_min != null ? `${Number(agent.avg_duration_min).toFixed(1)} min` : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-xs font-medium transition-colors ${
                            isExpanded ? 'text-primary-soft' : 'text-text-muted'
                          }`}
                        >
                          {isExpanded ? '▲ Hide' : '▼ Show'}
                        </span>
                      </td>
                      <td className="py-3 pr-0 pl-3">
                        <Button
                          variant="ghost"
                          disabled={isDeleting}
                          onClick={(e) => handleDelete(name, e)}
                          className="text-xs py-1 px-2"
                        >
                          {isDeleting ? '…' : 'Delete'}
                        </Button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`${name}-coaching`} className="bg-surface2/60">
                        <td colSpan={9} className="pt-4 px-0 pb-0">
                          <CoachingPanel agentName={name} apiFetch={apiFetch} globalDate={globalDate} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardPanel>
    </div>
  );
}
