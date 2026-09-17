'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Spinner, EmptyState } from '@/app/components/ui';
import { Search, AlertTriangle, Smartphone, ArrowUpCircle, Scale, TrendingDown } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

const OUTCOME_COLORS = {
  Resolved:    { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/30'  },
  Pending:     { bg: 'bg-amber-500/10',  text: 'text-amber-400',  border: 'border-amber-500/30'  },
  Unresolved:  { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30'    },
  Transferred: { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30'   },
  Escalated:   { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
};

const SENT_COLORS = {
  Positive: 'text-green-400',
  Neutral:  'text-blue-400',
  Mixed:    'text-amber-400',
  Negative: 'text-red-400',
};

function OutcomePill({ outcome }) {
  const s = OUTCOME_COLORS[outcome] ?? { bg: 'bg-surface2', text: 'text-text-muted', border: 'border-border' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${s.bg} ${s.text} ${s.border}`}>
      {outcome || '—'}
    </span>
  );
}

function ScoreBadge({ score }) {
  const s = score >= 80 ? 'bg-green-500/10 text-green-400' : score >= 60 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400';
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${s}`}>{score != null ? Number(score).toFixed(0) : '—'}</span>;
}

function SignalFlags({ row }) {
  return (
    <div className="flex flex-wrap gap-1">
      {row.threat_detected     && <span className="inline-flex items-center gap-0.5 rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400 uppercase">⚠ Threat</span>}
      {row.social_media_mention && <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-bold text-blue-400 uppercase">📱 Social</span>}
      {row.escalation_request  && <span className="inline-flex items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400 uppercase">🔺 Escalation</span>}
      {row.regulatory_mention  && <span className="inline-flex items-center gap-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-bold text-purple-400 uppercase">⚖ Regulatory</span>}
      {!row.threat_detected && !row.social_media_mention && !row.escalation_request && !row.regulatory_mention && (
        <span className="text-[10px] text-text-muted">—</span>
      )}
    </div>
  );
}

function MiniBar({ label, value, max, color }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 shrink-0 text-right text-[11px] text-text-muted truncate">{label}</div>
      <div className="flex-1 bg-border rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-6 text-[11px] font-semibold text-text-main">{value}</div>
    </div>
  );
}

const PRESET_KEYWORDS = ['refund', 'voucher', 'coupon', 'EasyPaisa', 'JazzCash', 'food quality', 'delivery'];

// ─── main page ────────────────────────────────────────────────────────────────

export default function SignalDrilldownPage() {
  const { apiFetch, globalDateFrom, globalDateTo } = useAuth();
  const [keyword, setKeyword] = useState('refund');
  const [inputVal, setInputVal] = useState('refund');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchData = useCallback(async (kw) => {
    setLoading(true);
    setError(null);
    setExpandedRow(null);
    try {
      let url = `/api/insights/keyword-drilldown?keyword=${encodeURIComponent(kw)}`;
      if (globalDateFrom) url += `&from=${globalDateFrom}`;
      if (globalDateTo)   url += `&to=${globalDateTo}`;
      const res = await apiFetch(url);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, globalDateFrom, globalDateTo]);

  useEffect(() => { fetchData(keyword); }, [fetchData, keyword]);

  function handleSearch(e) {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setKeyword(inputVal.trim());
  }

  const summary = data?.summary;
  const calls = data?.calls ?? [];

  const outcomeEntries = summary ? Object.entries(summary.outcomes).sort((a,b) => b[1]-a[1]) : [];
  const sentimentEntries = summary ? Object.entries(summary.sentiments).sort((a,b) => b[1]-a[1]) : [];
  const portalEntries = summary ? Object.entries(summary.byPortal).sort((a,b) => b[1]-a[1]) : [];
  const agentEntries = summary ? Object.entries(summary.byAgent).sort((a,b) => b[1]-a[1]).slice(0,8) : [];
  const maxOutcome = outcomeEntries[0]?.[1] ?? 1;
  const maxAgent = agentEntries[0]?.[1] ?? 1;

  const SENT_BAR_COLORS = { Negative: '#EF4444', Mixed: '#F59E0B', Neutral: '#60A5FA', Positive: '#22C55E', Unknown: '#6B7280' };
  const OUTCOME_BAR_COLORS = { Resolved: '#22C55E', Pending: '#F59E0B', Unresolved: '#EF4444', Transferred: '#60A5FA', Escalated: '#A78BFA' };

  return (
    <div className="space-y-5">

      {/* Search bar */}
      <div className="flex flex-col gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="Search keyword across all calls…"
              className="w-full rounded-lg border border-border2 bg-surface pl-8 pr-3 py-2 text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:border-primary/60"
            />
          </div>
          <button type="submit" className="btn-primary text-sm px-4 py-2">Search</button>
        </form>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-2">
          {PRESET_KEYWORDS.map(kw => (
            <button
              key={kw}
              onClick={() => { setInputVal(kw); setKeyword(kw); }}
              className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
                keyword === kw
                  ? 'border-primary/60 bg-primary/10 text-primary-soft'
                  : 'border-border text-text-muted hover:border-border2 hover:text-text-label'
              }`}
            >
              {kw}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner /></div>}
      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>}

      {!loading && data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: TrendingDown, label: 'Total Calls', value: summary.total, color: 'text-primary-soft', sub: `matching "${keyword}"` },
              { icon: AlertTriangle, label: 'Threats', value: summary.threats, color: 'text-red-400', sub: 'flagged by AI' },
              { icon: Smartphone, label: 'Social Media', value: summary.social, color: 'text-blue-400', sub: 'online threat' },
              { icon: ArrowUpCircle, label: 'Escalations', value: summary.escalations, color: 'text-amber-400', sub: 'supervisor demand' },
              { icon: Scale, label: 'Regulatory', value: summary.regulatory, color: 'text-purple-400', sub: 'legal/compliance' },
            ].map(({ icon: Icon, label, value, color, sub }) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <div className={`text-2xl font-bold leading-none ${color}`}>{value}</div>
                <div className="mt-1 text-[11px] font-semibold text-text-muted uppercase tracking-wide">{label}</div>
                <div className="mt-0.5 text-[10px] text-text-muted">{sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Outcomes */}
            <CardPanel title="Call Outcomes" className="col-span-1">
              <div className="space-y-2.5">
                {outcomeEntries.map(([outcome, count]) => (
                  <MiniBar key={outcome} label={outcome} value={count} max={maxOutcome} color={OUTCOME_BAR_COLORS[outcome] ?? '#8B5CF6'} />
                ))}
              </div>
            </CardPanel>

            {/* Sentiment */}
            <CardPanel title="Customer Sentiment" className="col-span-1">
              <div className="space-y-2.5">
                {sentimentEntries.map(([sent, count]) => (
                  <MiniBar key={sent} label={sent} value={count} max={summary.total} color={SENT_BAR_COLORS[sent] ?? '#6B7280'} />
                ))}
              </div>
              <p className="mt-3 text-[10px] text-red-400 font-semibold">
                {Math.round(((summary.sentiments['Negative'] ?? 0) / summary.total) * 100)}% negative — highest frustration keyword set
              </p>
            </CardPanel>

            {/* Portal split */}
            <CardPanel title="By Portal" className="col-span-1">
              <div className="space-y-2.5">
                {portalEntries.map(([portal, count]) => {
                  const short = portal.replace('Dominos - ', '').replace('Dominos Pizza - ', '');
                  return <MiniBar key={portal} label={short} value={count} max={summary.total} color="#6366F1" />;
                })}
              </div>
            </CardPanel>

            {/* Top agents */}
            <CardPanel title="Top Agents by Volume" className="col-span-1">
              <div className="space-y-2.5">
                {agentEntries.map(([agent, count]) => (
                  <MiniBar key={agent} label={agent} value={count} max={maxAgent} color="#8B5CF6" />
                ))}
              </div>
            </CardPanel>

          </div>

          {/* Call table */}
          <CardPanel title={`All ${calls.length} Calls — "${keyword}"`} sub="Click any row to see the full summary">
            {calls.length === 0 ? (
              <EmptyState title="No matching calls" sub="Try a different keyword" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      {['Call Ref','Agent','Portal','Score','Outcome','Sentiment','Signals'].map(h => (
                        <th key={h} className="pb-2 text-left font-semibold text-text-muted uppercase tracking-wide text-[10px] pr-4 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((row, i) => (
                      <>
                        <tr
                          key={row.call_id}
                          onClick={() => setExpandedRow(expandedRow === row.call_id ? null : row.call_id)}
                          className={`border-b border-border/50 cursor-pointer transition-colors hover:bg-surface2 ${expandedRow === row.call_id ? 'bg-primary/5' : ''}`}
                        >
                          <td className="py-2 pr-4 font-mono text-text-muted text-[10px] max-w-[140px] truncate">{row.call_ref || '—'}</td>
                          <td className="py-2 pr-4 text-text-main font-medium whitespace-nowrap">{row.agent_name || '—'}</td>
                          <td className="py-2 pr-4 text-text-muted whitespace-nowrap">{(row.portal || '').replace('Dominos - ', '').replace('Dominos Pizza - ', '')}</td>
                          <td className="py-2 pr-4"><ScoreBadge score={row.score} /></td>
                          <td className="py-2 pr-4"><OutcomePill outcome={row.call_outcome} /></td>
                          <td className={`py-2 pr-4 font-semibold text-[11px] ${SENT_COLORS[row.customer_sentiment_overall] ?? 'text-text-muted'}`}>
                            {row.customer_sentiment_overall || '—'}
                          </td>
                          <td className="py-2 pr-4"><SignalFlags row={row} /></td>
                        </tr>
                        {expandedRow === row.call_id && (
                          <tr key={`${row.call_id}-detail`} className="bg-primary/5">
                            <td colSpan={7} className="py-3 px-4">
                              <div className="space-y-2">
                                {/* Summary */}
                                <p className="text-[12px] text-text-label leading-relaxed">{row.summary || 'No summary available.'}</p>
                                {/* Complaints */}
                                {row.top_complaints && Array.isArray(row.top_complaints) && row.top_complaints.length > 0 && (
                                  <div>
                                    <div className="text-[10px] font-bold text-text-muted uppercase tracking-wide mb-1">Top Complaints</div>
                                    <ul className="space-y-0.5">
                                      {row.top_complaints.map((c, ci) => (
                                        <li key={ci} className="text-[11px] text-text-muted flex gap-1.5"><span className="text-primary-soft">·</span>{c}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {/* Signal details */}
                                {(row.threat_details || row.escalation_details || row.social_media_details || row.regulatory_details) && (
                                  <div className="space-y-1">
                                    {row.threat_details     && <p className="text-[11px] text-red-400"><span className="font-bold">⚠ Threat:</span> {row.threat_details}</p>}
                                    {row.escalation_details && <p className="text-[11px] text-amber-400"><span className="font-bold">🔺 Escalation:</span> {row.escalation_details}</p>}
                                    {row.social_media_details && <p className="text-[11px] text-blue-400"><span className="font-bold">📱 Social:</span> {row.social_media_details}</p>}
                                    {row.regulatory_details  && <p className="text-[11px] text-purple-400"><span className="font-bold">⚖ Regulatory:</span> {row.regulatory_details}</p>}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardPanel>
        </>
      )}
    </div>
  );
}
