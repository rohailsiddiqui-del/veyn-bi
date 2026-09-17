'use client';
import { useState, useEffect, useCallback } from 'react';
import { KpiCard, CardPanel, Spinner, EmptyState } from '@/app/components/ui';
import { BarChart, DoughnutChart } from '@/app/components/Charts';
import { useAuth } from '@/app/context/AuthContext';
import { Store, PhoneIncoming, PhoneOutgoing, Users, TrendingUp, TrendingDown, Star, AlertTriangle } from 'lucide-react';

const PORTAL_META = {
  order_taking:        { label: 'Order Taking',        icon: Store,          color: '#6366F1' },
  complaint_inbound:   { label: 'Complaint Inbound',   icon: PhoneIncoming,  color: '#F59E0B' },
  complaint_outbound:  { label: 'Complaint Outbound',  icon: PhoneOutgoing,  color: '#EF4444' },
};

function fmt(n, d = 1) {
  if (n === null || n === undefined) return '—';
  return typeof n === 'number' ? n.toFixed(d) : n;
}

function scoreColor(s) {
  if (!s) return 'text-text-muted';
  if (s >= 80) return 'text-emerald-400';
  if (s >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function PortalCard({ data, onClick, active }) {
  const meta = PORTAL_META[data.portal_type] || { label: data.name, icon: Store, color: '#6366F1' };
  const Icon = meta.icon;
  const score = parseFloat(data.avg_score) || 0;

  return (
    <button
      onClick={onClick}
      className={`text-left w-full rounded-xl border p-5 transition-all duration-200 ${
        active
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
          : 'border-border bg-surface hover:border-border2 hover:bg-surface/80'
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.color + '22' }}>
            <Icon size={16} style={{ color: meta.color }} />
          </div>
          <div>
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider">{meta.label}</div>
            <div className={`text-2xl font-bold mt-0.5 ${scoreColor(score)}`}>{score ? `${score.toFixed(1)}%` : '—'}</div>
          </div>
        </div>
        {score >= 80
          ? <TrendingUp size={16} className="text-emerald-400 mt-1" />
          : score >= 60
          ? <TrendingDown size={16} className="text-amber-400 mt-1" />
          : <AlertTriangle size={16} className="text-red-400 mt-1" />
        }
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-text-muted text-xs">Total Calls</div>
          <div className="font-semibold text-text-main">{data.total_calls ?? '—'}</div>
        </div>
        <div>
          <div className="text-text-muted text-xs">Avg Duration</div>
          <div className="font-semibold text-text-main">{data.avg_duration_min ? `${data.avg_duration_min}m` : '—'}</div>
        </div>
        <div>
          <div className="text-text-muted text-xs">Error Free</div>
          <div className="font-semibold text-emerald-400">{data.error_free ?? '—'}</div>
        </div>
        <div>
          <div className="text-text-muted text-xs">Deficient</div>
          <div className="font-semibold text-red-400">{data.deficient ?? '—'}</div>
        </div>
      </div>
    </button>
  );
}

function AgentTable({ agents, highlightPortal }) {
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-text-muted text-xs border-b border-border">
            <th className="text-left pb-2 pr-4">Agent</th>
            <th className="text-left pb-2 pr-4">Portals</th>
            <th className="text-right pb-2 pr-4">Calls</th>
            <th className="text-right pb-2 pr-4">Avg Score</th>
            <th className="text-right pb-2 pr-4">Error Free</th>
            <th className="text-right pb-2">Deficient</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-surface/60 transition-colors">
              <td className="py-2 pr-4 font-medium text-text-main">{a.agent_name || '—'}</td>
              <td className="py-2 pr-4">
                <div className="flex gap-1 flex-wrap">
                  {(a.portals || []).map((p, pi) => {
                    const meta = PORTAL_META[p.type] || { color: '#6366F1' };
                    const isHighlight = highlightPortal && p.type === highlightPortal;
                    return (
                      <span
                        key={pi}
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          background: meta.color + (isHighlight ? '44' : '22'),
                          color: meta.color,
                          opacity: highlightPortal && !isHighlight ? 0.5 : 1,
                        }}
                      >
                        {p.type === 'order_taking' ? 'OT' : p.type === 'complaint_inbound' ? 'CI' : 'CO'}
                      </span>
                    );
                  })}
                </div>
              </td>
              <td className="py-2 pr-4 text-right text-text-muted">{a.total_calls}</td>
              <td className={`py-2 pr-4 text-right font-semibold ${scoreColor(a.avg_score)}`}>
                {a.avg_score != null ? `${a.avg_score}%` : '—'}
              </td>
              <td className="py-2 pr-4 text-right text-emerald-400">{a.error_free}</td>
              <td className="py-2 text-right text-red-400">{a.deficient}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GroupOverviewPage({ onDrillDown }) {
  const { apiFetch, globalDateFrom, globalDateTo } = useAuth();
  const [portals, setPortals] = useState([]);
  const [activePortal, setActivePortal] = useState(null);
  const [agents, setAgents] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [loading, setLoading] = useState(true);

  const qs = () => {
    const p = new URLSearchParams();
    if (globalDateFrom) p.set('from', globalDateFrom);
    if (globalDateTo)   p.set('to',   globalDateTo);
    if (activePortal)   p.set('portalId', activePortal);
    return p.toString() ? `?${p}` : '';
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = qs();
      const [overview, agentsData, scoreData] = await Promise.all([
        apiFetch(`/api/group/overview${q}`),
        apiFetch(`/api/group/agents${q}`),
        apiFetch(`/api/group/scorecards${q}`),
      ]);
      setPortals(Array.isArray(overview) ? overview : []);
      setAgents(Array.isArray(agentsData) ? agentsData : []);
      setScorecards(Array.isArray(scoreData) ? scoreData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, globalDateFrom, globalDateTo, activePortal]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const displayPortals = activePortal ? portals.filter(p => p.id === activePortal) : portals;
  const displayAgents = agents; // already filtered by qs()
  const displayScorecards = activePortal ? scorecards.filter(s => s.id === activePortal) : scorecards;

  // Consolidated totals
  const totalCalls = portals.reduce((s, p) => s + parseInt(p.total_calls || 0), 0);
  const avgScore = portals.length
    ? portals.filter(p => p.avg_score).reduce((s, p) => s + parseFloat(p.avg_score), 0) / portals.filter(p => p.avg_score).length
    : null;

  return (
    <div className="space-y-6">

      {/* Portal selector tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActivePortal(null)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
            !activePortal ? 'bg-primary text-white border-primary' : 'border-border text-text-muted hover:border-border2'
          }`}
        >
          All Portals
        </button>
        {portals.map(p => {
          const meta = PORTAL_META[p.portal_type] || { label: p.name };
          return (
            <button
              key={p.id}
              onClick={() => setActivePortal(p.id === activePortal ? null : p.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                activePortal === p.id
                  ? 'bg-primary text-white border-primary'
                  : 'border-border text-text-muted hover:border-border2'
              }`}
            >
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* Consolidated KPI row (only when showing All) */}
      {!activePortal && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Total Calls" value={totalCalls} accent="purple" />
          <KpiCard label="Avg Score" value={avgScore ? `${avgScore.toFixed(1)}%` : '—'} accent={avgScore >= 80 ? 'green' : avgScore >= 60 ? 'amber' : 'red'} />
          <KpiCard label="Active Agents" value={new Set(agents.map(a => a.agent_name)).size} accent="blue" />
          <KpiCard label="Portals Active" value={portals.filter(p => parseInt(p.total_calls) > 0).length} accent="purple" />
        </div>
      )}

      {/* Portal cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {portals.map(p => (
          <PortalCard
            key={p.id}
            data={p}
            active={activePortal === p.id}
            onClick={() => setActivePortal(p.id === activePortal ? null : p.id)}
          />
        ))}
      </div>

      {/* Scorecards by portal */}
      {displayScorecards.map(sc => {
        const meta = PORTAL_META[sc.portal_type] || { label: sc.name, color: '#6366F1' };
        if (!sc.parameters?.length && !sc.agents?.length) return null;
        return (
          <CardPanel key={sc.id} title={`${meta.label} — Parameter Breakdown`}>
            <div className="space-y-2 mt-2">
              {sc.parameters.slice(0, 10).map(p => {
                const pct = parseFloat(p.pct) || 0;
                return (
                  <div key={p.param_name} className="flex items-center gap-3">
                    <div className="text-xs text-text-muted w-44 truncate shrink-0" title={p.param_name}>{p.param_name}</div>
                    <div className="flex-1 bg-surface2 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(pct, 100)}%`,
                          background: pct >= 80 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444'
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold w-10 text-right ${scoreColor(pct)}`}>{pct.toFixed(0)}%</span>
                      <span className="text-[10px] text-text-muted w-16 text-right">{fmt(p.avg_score, 1)} avg</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardPanel>
        );
      })}

      {/* Top agents — when specific portal selected: flat sorted list; when All Portals: one table per portal */}
      {displayAgents.length > 0 && (
        activePortal ? (
          // Single portal selected — flat list
          <CardPanel title={`Top Agents — ${PORTAL_META[portals.find(p=>p.id===activePortal)?.portal_type]?.label || 'Portal'}`}>
            <AgentTable agents={displayAgents.slice(0, 15)} />
          </CardPanel>
        ) : (
          // All Portals — split agents by portal so each portal's top agents are visible
          Object.entries(PORTAL_META).map(([portalType, meta]) => {
            const portalAgents = displayAgents
              .filter(a => a.portals.some(p => p.type === portalType))
              .sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
              .slice(0, 10);
            if (!portalAgents.length) return null;
            return (
              <CardPanel key={portalType} title={`Top Agents — ${meta.label}`}>
                <AgentTable agents={portalAgents} highlightPortal={portalType} />
              </CardPanel>
            );
          })
        )
      )}

      {!loading && portals.every(p => parseInt(p.total_calls || 0) === 0) && (
        <EmptyState message="No call data yet. Upload calls for each portal to see the consolidated view." />
      )}
    </div>
  );
}
