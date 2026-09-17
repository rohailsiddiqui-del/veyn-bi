'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { KpiCard, CardPanel, Badge, Button, Select, Spinner, EmptyState } from '@/app/components/ui';
import { Phone, MessageSquare } from 'lucide-react';
import { DoughnutChart, BarChart, RadialGauge, RankedBarChart } from '@/app/components/Charts';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(val, dec = 1) {
  if (val == null || isNaN(val)) return '—';
  return Number(val).toFixed(dec);
}

function sentimentAccent(score) {
  if (score == null) return 'purple';
  if (score >= 65) return 'green';
  if (score >= 45) return 'amber';
  return 'red';
}

const FLAG_STYLES = {
  threat:     { bg: 'bg-red-500/10',     text: 'text-red-400',    border: 'border-red-500/30'    },
  social:     { bg: 'bg-blue-500/10',    text: 'text-blue-400',   border: 'border-blue-500/30'   },
  escalation: { bg: 'bg-amber-500/10',   text: 'text-amber-400',  border: 'border-amber-500/30'  },
  regulatory: { bg: 'bg-purple-500/10',  text: 'text-purple-400', border: 'border-purple-500/30' },
};

function FlagPill({ type }) {
  const s = FLAG_STYLES[type] ?? FLAG_STYLES.threat;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.bg} ${s.text} ${s.border}`}>
      {type}
    </span>
  );
}

function SentimentBar({ agentName, score }) {
  const pct = Math.max(0, Math.min(100, score ?? 50));
  const barColor = pct >= 65 ? '#22C55E' : pct >= 45 ? '#F59E0B' : '#EF4444';
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 truncate text-xs text-text-muted text-right">{agentName}</div>
      <div className="flex-1 flex items-center gap-0 rounded-full overflow-hidden bg-border h-3">
        <div style={{ width: `${pct}%`, background: barColor, height: '100%', transition: 'width 0.6s' }} />
        <div style={{ width: `${100 - pct}%`, height: '100%' }} />
      </div>
      <div className="w-10 text-xs text-text-main font-semibold text-left">{fmt(pct, 0)}%</div>
    </div>
  );
}

// ─── signal card ────────────────────────────────────────────────────────────

function SignalCard({ emoji, label, count, colorClass, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col gap-1 rounded-xl border p-4 text-left transition-all duration-200 cursor-pointer w-full
        ${active ? 'border-current ' + colorClass.border : 'border-border hover:border-border2'}
        ${colorClass.bg}`}
    >
      <div className="text-2xl">{emoji}</div>
      <div className={`text-2xl font-bold leading-none ${colorClass.text}`}>{count ?? '—'}</div>
      <div className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">{label}</div>
    </button>
  );
}

const SIGNAL_CONFIGS = {
  threats:     { emoji: '⚠️', label: 'Threats',      color: { bg: 'bg-red-500/5',    text: 'text-red-400',    border: 'border-red-500/40'    } },
  social:      { emoji: '📱', label: 'Social Media', color: { bg: 'bg-blue-500/5',   text: 'text-blue-400',   border: 'border-blue-500/40'   } },
  escalations: { emoji: '🔺', label: 'Escalations',  color: { bg: 'bg-amber-500/5',  text: 'text-amber-400',  border: 'border-amber-500/40'  } },
  regulatory:  { emoji: '⚖️', label: 'Regulatory',   color: { bg: 'bg-purple-500/5', text: 'text-purple-400', border: 'border-purple-500/40' } },
  negative:    { emoji: '😠', label: 'Negative',     color: { bg: 'bg-red-500/5',    text: 'text-red-400',    border: 'border-red-500/40'    } },
  positive:    { emoji: '😊', label: 'Positive',     color: { bg: 'bg-green-500/5',  text: 'text-green-400',  border: 'border-green-500/40'  } },
};

const SIGNAL_TYPE_MAP = {
  threats:     'threat',
  social:      'social',
  escalations: 'escalation',
  regulatory:  'regulatory',
  negative:    'negative',
  positive:    'positive',
};

// ─── channel sentiment comparison (case-mode) ────────────────────────────────

function ChannelSentimentCard({ channelSentiment }) {
  if (!channelSentiment || channelSentiment.length === 0) return null;
  const SENT_COLORS = { Positive: '#22C55E', Neutral: '#F59E0B', Mixed: '#8B5CF6', Negative: '#EF4444' };
  return (
    <CardPanel title="Voice vs WhatsApp — Sentiment Breakdown" sub="Avg sentiment = mean AI score (0–100) across all interactions on that channel. Bars show how many interactions fell into each sentiment bucket.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {channelSentiment.map((ch) => {
          const total = Number(ch.total) || 1;
          const bars = [
            { label: 'Positive', count: Number(ch.positive), color: SENT_COLORS.Positive },
            { label: 'Neutral',  count: Number(ch.neutral),  color: SENT_COLORS.Neutral  },
            { label: 'Mixed',    count: Number(ch.mixed),    color: SENT_COLORS.Mixed    },
            { label: 'Negative', count: Number(ch.negative), color: SENT_COLORS.Negative },
          ];
          const avgSent = Number(ch.avg_sentiment);
          const sentColor = avgSent >= 65 ? '#22C55E' : avgSent >= 45 ? '#F59E0B' : '#EF4444';
          return (
            <div key={ch.channel} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {ch.channel?.toLowerCase() === 'voice'
                    ? <Phone size={14} className="text-text-muted" />
                    : <MessageSquare size={14} className="text-text-muted" />}
                  <span className="text-sm font-semibold text-text-main">{ch.channel}</span>
                  <span className="text-xs text-text-muted">({total} interactions)</span>
                </div>
                <span className="text-sm font-bold" style={{ color: sentColor }}>{fmt(avgSent, 0)}% avg</span>
              </div>
              <div className="space-y-1.5">
                {bars.map(({ label, count, color }) => {
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      <div className="w-14 text-text-muted text-right">{label}</div>
                      <div className="flex-1 rounded-full bg-border h-2.5 overflow-hidden">
                        <div style={{ width: `${pct}%`, background: color, height: '100%', transition: 'width 0.6s' }} />
                      </div>
                      <div className="w-8 text-text-muted">{count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </CardPanel>
  );
}

// ─── FCR summary card (case-mode) ────────────────────────────────────────────

function FCRCard({ fcrData }) {
  if (!fcrData || !fcrData.total_cases) return null;
  const total = Number(fcrData.total_cases);
  const single = Number(fcrData.single_touch);
  const multi = Number(fcrData.multi_touch);
  const fcrPct = total > 0 ? Math.round((single / total) * 100) : 0;
  const fcrColor = fcrPct >= 60 ? '#22C55E' : fcrPct >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <CardPanel title="First Contact Resolution (FCR)">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-4 text-center">
          <div className="text-3xl font-bold" style={{ color: fcrColor }}>{fcrPct}%</div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mt-1">FCR Rate</div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-4 text-center">
          <div className="text-3xl font-bold text-green-400">{single}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mt-1">Resolved in 1 Touch</div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-4 text-center">
          <div className="text-3xl font-bold text-amber-400">{multi}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mt-1">Multi-Touch Cases</div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-4 text-center">
          <div className="text-3xl font-bold text-purple-400">{fmt(Number(fcrData.avg_interactions), 1)}</div>
          <div className="text-[10px] text-text-muted uppercase tracking-widest mt-1">Avg Interactions / Case</div>
        </div>
      </div>
      {/* Multi-touch progress bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-text-muted mb-1">
          <span>Single-touch ({single})</span>
          <span>Multi-touch ({multi})</span>
        </div>
        <div className="flex rounded-full overflow-hidden h-3 bg-border">
          <div style={{ width: `${fcrPct}%`, background: '#22C55E', transition: 'width 0.6s' }} />
          <div style={{ width: `${100 - fcrPct}%`, background: '#F59E0B', transition: 'width 0.6s' }} />
        </div>
      </div>
    </CardPanel>
  );
}

// ─── resolution by category (QSR) ────────────────────────────────────────────

function ResolutionByCategoryCard({ data }) {
  if (!data || !data.length) return null;
  return (
    <CardPanel
      title="Resolution Rate by Category"
      sub="Which complaint types are being resolved vs left unresolved or escalated. Helps prioritise agent training and process gaps."
    >
      <div className="space-y-4 mt-2">
        {data.map((row) => {
          const total   = Number(row.total)     || 1;
          const resPct  = Math.round((Number(row.resolved)   / total) * 100);
          const unresPct= Math.round((Number(row.unresolved) / total) * 100);
          const escalPct= Math.round((Number(row.escalated)  / total) * 100);
          return (
            <div key={row.call_category} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-text-main truncate max-w-[220px]" title={row.call_category}>{row.call_category}</span>
                <span className="text-text-muted shrink-0 ml-2">{row.total} calls</span>
              </div>
              <div className="flex rounded-full overflow-hidden h-2.5 gap-px bg-border">
                {resPct  > 0 && <div style={{ width: `${resPct}%`,   background: '#10B981' }} title={`Resolved: ${resPct}%`} />}
                {unresPct> 0 && <div style={{ width: `${unresPct}%`, background: '#EF4444' }} title={`Unresolved: ${unresPct}%`} />}
                {escalPct> 0 && <div style={{ width: `${escalPct}%`, background: '#F59E0B' }} title={`Escalated: ${escalPct}%`} />}
              </div>
              <div className="flex gap-3 text-[10px]">
                <span className="text-emerald-400 font-semibold">{resPct}% resolved</span>
                {unresPct > 0 && <span className="text-red-400">{unresPct}% unresolved</span>}
                {escalPct > 0 && <span className="text-amber-400">{escalPct}% escalated</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-5 mt-4 pt-3 border-t border-border text-[10px] text-text-muted">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Resolved</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Unresolved</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Escalated</span>
      </div>
    </CardPanel>
  );
}

// ─── agent performance table (QSR) ───────────────────────────────────────────

function scoreColorPct(s) {
  if (!s && s !== 0) return 'text-text-muted';
  if (s >= 80) return 'text-emerald-400';
  if (s >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function AgentPerformanceTable({ agents, isCaseMode }) {
  if (!agents || !agents.length) return <div className="text-sm text-text-muted py-3 text-center">No agent data.</div>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] font-semibold text-text-muted uppercase tracking-widest">
            <th className="text-left py-2 px-3">Agent</th>
            <th className="text-right py-2 px-3">Calls</th>
            <th className="text-right py-2 px-3">Avg Sentiment</th>
            <th className="text-right py-2 px-3">Resolution</th>
            <th className="text-right py-2 px-3">Negative</th>
            <th className="text-right py-2 px-3">Escalations</th>
            <th className="text-right py-2 px-3">Threats</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a, i) => {
            const sentScore = a.avg_customer_sentiment != null
              ? isCaseMode ? Number(a.avg_customer_sentiment) : Number(a.avg_customer_sentiment) * 100 + 50
              : null;
            const resRate = a.resolution_rate != null ? Number(a.resolution_rate) : null;
            return (
              <tr key={i} className="border-b border-border/40 hover:bg-surface/60 transition-colors">
                <td className="py-2.5 px-3 font-medium text-text-main">{a.agent_name || '—'}</td>
                <td className="py-2.5 px-3 text-right text-text-muted">{a.total_calls}</td>
                <td className={`py-2.5 px-3 text-right font-semibold ${scoreColorPct(sentScore)}`}>
                  {sentScore != null ? `${Number(sentScore).toFixed(0)}%` : '—'}
                </td>
                <td className={`py-2.5 px-3 text-right font-semibold ${scoreColorPct(resRate)}`}>
                  {resRate != null ? `${resRate}%` : '—'}
                </td>
                <td className="py-2.5 px-3 text-right text-red-400">{a.negative_calls ?? 0}</td>
                <td className="py-2.5 px-3 text-right text-amber-400">{a.escalations ?? 0}</td>
                <td className="py-2.5 px-3 text-right text-red-500">{a.threats ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── location performance table (QSR) ─────────────────────────────────────────

function LocationPerformanceCard({ locations }) {
  if (!locations || !locations.length) return null;
  return (
    <CardPanel
      title="Branch / Location Performance"
      sub="Calls mentioning each location, with resolution rate and avg customer sentiment. Identifies branches that need attention."
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] font-semibold text-text-muted uppercase tracking-widest">
              <th className="text-left py-2 px-3">Location</th>
              <th className="text-right py-2 px-3">Calls</th>
              <th className="text-right py-2 px-3">Resolved</th>
              <th className="text-right py-2 px-3">Unresolved</th>
              <th className="text-right py-2 px-3">Escalated</th>
              <th className="text-right py-2 px-3">Avg Sentiment</th>
            </tr>
          </thead>
          <tbody>
            {locations.slice(0, 15).map((loc, i) => {
              const total   = Number(loc.call_count)  || 0;
              const resolved= Number(loc.resolved)    || 0;
              const unres   = Number(loc.unresolved)  || 0;
              const escal   = Number(loc.escalated)   || 0;
              const resRate = total ? Math.round((resolved / total) * 100) : null;
              const sentiment = loc.avg_sentiment != null ? Number(loc.avg_sentiment) : null;
              return (
                <tr key={i} className="border-b border-border/40 hover:bg-surface/60 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-text-main">{loc.location || '—'}</td>
                  <td className="py-2.5 px-3 text-right text-text-muted">{total}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-400">{resolved}</td>
                  <td className="py-2.5 px-3 text-right text-red-400">{unres}</td>
                  <td className="py-2.5 px-3 text-right text-amber-400">{escal}</td>
                  <td className={`py-2.5 px-3 text-right font-semibold ${scoreColorPct(sentiment)}`}>
                    {sentiment != null ? `${Number(sentiment).toFixed(0)}%` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardPanel>
  );
}

// ─── expanded call row ───────────────────────────────────────────────────────

function ExpandedCall({ callId, caseMode }) {
  const { apiFetch } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    const endpoint = caseMode
      ? `/api/cases/insights/interaction/${callId}`
      : `/api/insights/call/${callId}/full`;
    apiFetch(endpoint)
      .then((d) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [callId, caseMode, apiFetch]);

  if (loading) return <div className="py-4"><Spinner /></div>;
  if (err) return <div className="py-3 text-sm text-danger">Failed to load: {err}</div>;
  if (!detail) return null;

  const insight = caseMode ? detail : (detail.insight || {});
  const transcriptStr = caseMode
    ? (detail.translation || detail.transcript || null)
    : (detail.transcript?.translation_text ?? detail.transcript?.transcription_text ?? insight.transcript);
  const moments = (() => {
    const raw = insight.key_moments ?? insight.moments ?? insight.keyMoments ?? [];
    if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return []; } }
    return Array.isArray(raw) ? raw : [];
  })();

  return (
    <div className="space-y-4 text-sm">
      {insight.summary && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Summary</div>
          <p className="text-text-main leading-relaxed">{insight.summary}</p>
        </div>
      )}
      {(insight.threat_details || insight.escalation_details || insight.social_media_details || insight.regulatory_details) && (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Why Flagged</div>
          {insight.threat_details && <p className="text-red-400 leading-relaxed text-xs"><strong>Threat:</strong> {insight.threat_details}</p>}
          {insight.escalation_details && <p className="text-amber-400 leading-relaxed text-xs"><strong>Escalation:</strong> {insight.escalation_details}</p>}
          {insight.social_media_details && <p className="text-blue-400 leading-relaxed text-xs"><strong>Social:</strong> {insight.social_media_details}</p>}
          {insight.regulatory_details && <p className="text-purple-400 leading-relaxed text-xs"><strong>Regulatory:</strong> {insight.regulatory_details}</p>}
        </div>
      )}
      {moments.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2">Key Moments</div>
          <ol className="border-l border-border ml-3 space-y-3">
            {moments.map((m, i) => (
              <li key={i} className="relative pl-5">
                <span className="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface" />
                <div className="text-[10px] text-text-muted">{m.timestamp ?? m.time ?? `Point ${i + 1}`}</div>
                <div className="text-text-main">{m.description ?? m.text ?? m}</div>
              </li>
            ))}
          </ol>
        </div>
      )}
      {(insight.call_outcome || insight.call_category) && (
        <div className="flex gap-4 flex-wrap">
          {insight.call_category && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Category</div>
              <Badge variant="info">{insight.call_category}</Badge>
            </div>
          )}
          {insight.call_outcome && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Outcome</div>
              <Badge variant="default">{insight.call_outcome}</Badge>
            </div>
          )}
        </div>
      )}
      {transcriptStr && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2">Transcript</div>
          <div className="max-h-64 overflow-y-auto rounded-lg bg-surface border border-border p-3 font-mono text-xs text-text-muted whitespace-pre-wrap leading-relaxed">
            {transcriptStr.replace(/^\s*\[[^\]]*\]\s*/gm, '')}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { apiFetch, globalDateFrom, globalDateTo, user } = useAuth();
  const isCaseMode = user?.dashboard_mode === 'case';
  const isGroupMode = user?.dashboard_mode === 'group';

  // Group mode: live portal list fetched from DB (not stale localStorage user.portals)
  const [livePortals, setLivePortals] = useState(user?.portals || []);
  useEffect(() => {
    if (!isGroupMode) return;
    apiFetch('/api/group/portals')
      .then(data => { if (Array.isArray(data) && data.length) setLivePortals(data); })
      .catch(() => {});
  }, [apiFetch, isGroupMode]);

  // Group mode: portal tabs — null = all portals consolidated
  const [activePortal, setActivePortal] = useState(null);

  const [summary, setSummary]               = useState(null);
  const [categories, setCategories]         = useState([]);
  const [signals, setSignals]               = useState([]);
  const [complaints, setComplaints]         = useState([]);
  const [moments, setMoments]               = useState([]);
  const [sentimentByAgent, setSentimentByAgent] = useState([]);
  const [locations, setLocations]           = useState([]);
  const [products, setProducts]             = useState([]);
  const [productTypes, setProductTypes]     = useState([]);
  const [channelSentiment, setChannelSentiment] = useState([]);
  const [fcrData, setFcrData]               = useState({});
  const [signalsByChannel, setSignalsByChannel] = useState([]);
  const [resolutionByCategory, setResolutionByCategory] = useState([]);

  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [signalType, setSignalType]         = useState('all');
  const [signalFilter, setSignalFilter]     = useState(null);
  const [processing, setProcessing]         = useState(false);
  const [processStatus, setProcessStatus]   = useState('');
  const [expandedCallId, setExpandedCallId] = useState(null);
  const [deletingCallId, setDeletingCallId] = useState(null);
  const [channelFilter, setChannelFilter]   = useState(null);
  const [sigSort, setSigSort]               = useState({ key: null, dir: 'asc' });

  const deleteCall = useCallback(async (callId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this interaction and all its data? This cannot be undone.')) return;
    setDeletingCallId(callId);
    try {
      await apiFetch(`/api/analytics/calls/${callId}`, { method: 'DELETE' });
      setSignals(prev => prev.filter(s => (s.call_id ?? s.callId ?? s.id) !== callId));
      if (expandedCallId === callId) setExpandedCallId(null);
    } catch (err) {
      alert('Delete failed: ' + err.message);
    } finally {
      setDeletingCallId(null);
    }
  }, [apiFetch, expandedCallId]);

  const fetchSignals = useCallback(async (type) => {
    try {
      const buildQs = (portalId) => {
        const p = new URLSearchParams();
        if (type && type !== 'all') p.append('type', type);
        if (globalDateFrom) p.append('from', globalDateFrom);
        if (globalDateTo)   p.append('to', globalDateTo + ' 23:59:59');
        if (isCaseMode && channelFilter) p.append('channel', channelFilter);
        if (portalId) p.append('forTenant', portalId);
        return p.toString();
      };

      if (isGroupMode && !activePortal && livePortals.length) {
        // All Portals — fetch from each portal in parallel so each portal's signals are correctly scoped
        const results = await Promise.all(
          livePortals.map(p => apiFetch(`/api/insights/signals?${buildQs(p.id)}`).catch(() => []))
        );
        setSignals(results.flat().filter(Boolean));
      } else {
        const qs = buildQs(isGroupMode && activePortal ? activePortal : null);
        const endpoint = isCaseMode
          ? `/api/cases/insights/all${qs ? '?' + qs : ''}`
          : `/api/insights/signals${qs ? '?' + qs : ''}`;
        const data = await apiFetch(endpoint);
        setSignals(Array.isArray(data) ? data : data.signals ?? []);
      }
    } catch (_) {}
  }, [apiFetch, globalDateFrom, globalDateTo, isCaseMode, isGroupMode, activePortal, channelFilter, livePortals]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qp = new URLSearchParams();
    if (globalDateFrom) qp.append('from', globalDateFrom);
    if (globalDateTo)   qp.append('to', globalDateTo + ' 23:59:59');
    if (isCaseMode && channelFilter) qp.append('channel', channelFilter);

    const applyData = (d) => {
      if (d.summary)          setSummary(d.summary);
      if (d.categories)       setCategories(d.categories);
      if (d.signals)          setSignals(d.signals);
      if (d.complaints)       setComplaints(d.complaints);
      if (d.moments)          setMoments(d.moments);
      if (d.sentimentByAgent) setSentimentByAgent(d.sentimentByAgent);
      if (d.locations)        setLocations(d.locations);
      if (d.products)         setProducts(d.products);
      if (d.productTypes)     setProductTypes(d.productTypes);
      if (d.channelSentiment)      setChannelSentiment(d.channelSentiment);
      if (d.fcrData)               setFcrData(d.fcrData);
      if (d.signalsByChannel)      setSignalsByChannel(d.signalsByChannel);
      if (d.resolutionByCategory)  setResolutionByCategory(d.resolutionByCategory);
    };

    const mergeInsightsData = (results) => {
      // Sum numeric summary fields across portals
      const keys = ['total_analysed','success_count','threat_calls','social_media_calls','escalation_calls',
        'regulatory_calls','positive_calls','negative_calls','neutral_calls','mixed_calls',
        'resolved_calls','unresolved_calls','escalated_calls'];
      const merged = {};
      for (const k of keys) merged[k] = results.reduce((s, d) => s + Number(d.summary?.[k] || 0), 0);
      // Weighted avg sentiment
      const total = merged.total_analysed || 1;
      merged.avg_customer_sentiment = results.reduce((s, d) => s + Number(d.summary?.avg_customer_sentiment || 0) * Number(d.summary?.total_analysed || 0), 0) / total;
      merged.avg_customer_talk_pct  = results.reduce((s, d) => s + Number(d.summary?.avg_customer_talk_pct  || 0) * Number(d.summary?.total_analysed || 0), 0) / total;
      setSummary(merged);

      // Merge categories (sum counts by name)
      const catMap = {};
      for (const d of results) for (const c of (d.categories || [])) {
        const key = c.call_subcategory ?? c.call_category ?? c.category ?? c.name ?? 'Other';
        catMap[key] = (catMap[key] || 0) + Number(c.count || 0);
      }
      setCategories(Object.entries(catMap).map(([k, v]) => ({ call_subcategory: k, count: v })).sort((a,b) => b.count - a.count));

      // Concat signals from all portals
      setSignals(results.flatMap(d => d.signals || []));

      // Merge complaints — normalize key to lower+trim to collapse AI phrasing variations
      const compMap = {};
      const toTitleCase = s => s.replace(/\b\w/g, l => l.toUpperCase());
      for (const d of results) for (const c of (d.complaints || [])) {
        const raw = c.complaint ?? c.text ?? '';
        const key = raw.toLowerCase().trim();
        if (!compMap[key]) compMap[key] = { label: toTitleCase(key), freq: 0 };
        compMap[key].freq += Number(c.frequency ?? c.count ?? 0);
      }
      setComplaints(Object.values(compMap).map(v => ({ complaint: v.label, frequency: v.freq })).sort((a,b) => b.frequency - a.frequency));

      // Merge moments (sum by type)
      const momMap = {};
      for (const d of results) for (const m of (d.moments || [])) {
        const key = m.moment_type ?? m.type ?? m.label ?? '';
        momMap[key] = (momMap[key] || 0) + Number(m.frequency ?? m.count ?? 0);
      }
      setMoments(Object.entries(momMap).map(([k,v]) => ({ moment_type: k, frequency: v })).sort((a,b) => b.frequency - a.frequency));

      // Concat sentiment by agent
      setSentimentByAgent(results.flatMap(d => d.sentimentByAgent || []));

      // Merge resolution by category (sum by category name)
      const rcMap = {};
      for (const d of results) for (const r of (d.resolutionByCategory || [])) {
        const key = r.call_category ?? '';
        if (!rcMap[key]) rcMap[key] = { call_category: key, total: 0, resolved: 0, unresolved: 0, escalated: 0 };
        rcMap[key].total     += Number(r.total     || 0);
        rcMap[key].resolved  += Number(r.resolved  || 0);
        rcMap[key].unresolved+= Number(r.unresolved|| 0);
        rcMap[key].escalated += Number(r.escalated || 0);
      }
      setResolutionByCategory(Object.values(rcMap).sort((a,b) => b.total - a.total));
    };

    (async () => {
      try {
        if (isCaseMode) {
          const qs = qp.toString() ? `?${qp}` : '';
          const d = await apiFetch(`/api/cases/insights/all${qs}`);
          if (!cancelled) { applyData(d); setLoading(false); }
        } else if (isGroupMode && !activePortal) {
          // Fetch all portals in parallel and merge — use live portal list
          const portals = livePortals;
          if (!portals.length) { setLoading(false); return; }
          const results = await Promise.all(portals.map(p => {
            const pq = new URLSearchParams(qp);
            pq.set('forTenant', p.id);
            return apiFetch(`/api/insights/all?${pq}`).catch(() => ({}));
          }));
          if (!cancelled) { mergeInsightsData(results); setLoading(false); }
        } else {
          if (isGroupMode && activePortal) qp.append('forTenant', activePortal);
          const qs = qp.toString() ? `?${qp}` : '';
          const d = await apiFetch(`/api/insights/all${qs}`);
          if (!cancelled) { applyData(d); setLoading(false); }
        }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    })();

    return () => { cancelled = true; };
  }, [apiFetch, globalDateFrom, globalDateTo, isCaseMode, isGroupMode, activePortal, channelFilter, livePortals]);

  useEffect(() => {
    if (!loading) fetchSignals(signalType);
  }, [signalType, loading, fetchSignals]);

  const handleProcess = useCallback(async () => {
    setProcessing(true);
    setProcessStatus('Processing…');
    try {
      if (isCaseMode) {
        const data = await apiFetch('/api/cases/insights/process', { method: 'POST' });
        setProcessStatus(data?.message ?? 'Processing started.');
      } else if (isGroupMode) {
        // Process the active portal, or all portals if "All Portals" selected
        const portalsToProcess = activePortal
          ? livePortals.filter(p => p.id === activePortal)
          : livePortals;
        let total = 0;
        for (const p of portalsToProcess) {
          const data = await apiFetch(`/api/insights/process?forTenant=${p.id}`, { method: 'POST' });
          total += data?.pending || 0;
        }
        setProcessStatus(`Processing ${total} calls across ${portalsToProcess.length} portal(s)…`);
      } else {
        const data = await apiFetch('/api/insights/process', { method: 'POST' });
        setProcessStatus(data?.message ?? 'Processing started.');
      }
    } catch (err) {
      setProcessStatus('Error: ' + (err.message || 'Failed'));
    } finally {
      setProcessing(false);
    }
  }, [apiFetch, isCaseMode, isGroupMode, activePortal, user?.portals]);

  // ── derived chart data ──

  // Call classification — case-mode uses call_category, standard uses subcategory
  const catLabels = isCaseMode
    ? categories.map((c) => c.category ?? c.call_category ?? 'Other')
    : categories.map((c) => c.call_subcategory ?? c.call_category ?? c.category ?? c.name ?? 'Other');
  const catCounts  = categories.map((c) => Number(c.count ?? 0));
  const CAT_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];

  const sentLabels  = ['Positive', 'Neutral', 'Mixed', 'Negative'];
  const sentCounts  = [
    Number(summary?.positive_calls || 0),
    Number(summary?.neutral_calls  || 0),
    Number(summary?.mixed_calls    || 0),
    Number(summary?.negative_calls || 0),
  ];
  const SENT_COLORS = ['#22C55E', '#F59E0B', '#8B5CF6', '#EF4444'];

  // Standard-mode only
  const outLabels = ['Resolved', 'Unresolved', 'Escalated'];
  const outCounts = [
    Number(summary?.resolved_calls   || 0),
    Number(summary?.unresolved_calls || 0),
    Number(summary?.escalated_calls  || 0),
  ];
  const OUT_COLORS  = ['#22C55E', '#EF4444', '#F59E0B'];
  const talkLabels  = ['Agent Talk', 'Customer Talk'];
  const talkData    = [100 - Number(summary?.avg_customer_talk_pct ?? 50), Number(summary?.avg_customer_talk_pct ?? 50)];
  const TALK_COLORS = ['#8B5CF6', '#3B82F6'];

  const locLabels  = locations.slice(0, 12).map((l) => l.location ?? l.name ?? l._id ?? '');
  const locCounts  = locations.slice(0, 12).map((l) => Number(l.call_count ?? l.count ?? 0));
  const prodLabels = products.slice(0, 12).map((p) => p.product ?? p.name ?? p._id ?? '');
  const prodCounts = products.slice(0, 12).map((p) => Number(p.frequency ?? p.count ?? 0));

  // Case-mode: product types
  const PRODUCT_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#14B8A6','#F97316','#6366F1','#84CC16'];
  const ptLabels = productTypes.map((p) => p.product_type ?? '');
  const ptCounts = productTypes.map((p) => Number(p.count ?? 0));

  // Case-mode: top issues (normalized complaint buckets)
  const ISSUE_COLORS = ['#EF4444','#F59E0B','#3B82F6','#8B5CF6','#10B981','#EC4899','#14B8A6','#F97316'];
  const issueLabels  = complaints.slice(0, 8).map((c) => c.complaint ?? c.text ?? '');
  const issueCounts  = complaints.slice(0, 8).map((c) => Number(c.frequency ?? c.count ?? 0));

  const sigCounts = {
    threats:     summary?.threat_calls,
    social:      summary?.social_media_calls,
    escalations: summary?.escalation_calls,
    regulatory:  summary?.regulatory_calls,
    negative:    summary?.negative_calls,
    positive:    summary?.positive_calls,
  };
  const SIGNAL_ORDER = ['threats', 'social', 'escalations', 'regulatory', 'negative', 'positive'];

  const displayedSignals = signalFilter
    ? signals.filter((s) => {
        if (signalFilter === 'negative') return s.customer_sentiment_overall?.toLowerCase() === 'negative';
        if (signalFilter === 'positive') return s.customer_sentiment_overall?.toLowerCase() === 'positive';
        const types = [];
        if (s.threat_detected)      types.push('threat');
        if (s.social_media_mention) types.push('social');
        if (s.escalation_request)   types.push('escalation');
        if (s.regulatory_mention)   types.push('regulatory');
        return types.includes(SIGNAL_TYPE_MAP[signalFilter]);
      })
    : signals;

  // Sortable flagged-interactions table
  const sigAccessor = (s, key) => {
    switch (key) {
      case 'ref':     return String(s.call_ref ?? s.callRef ?? s.id ?? s._id ?? '');
      case 'agent':   return String(s.agent_name ?? s.agent ?? '').toLowerCase();
      case 'channel': return String(s.channel ?? '').toLowerCase();
      case 'type':    return String(s.call_category ?? s.category ?? '').toLowerCase();
      case 'sentiment': { const o = { positive: 4, neutral: 3, mixed: 2, negative: 1 }; return o[String(s.customer_sentiment_overall ?? '').toLowerCase()] ?? 0; }
      default: return '';
    }
  };
  const finalSignals = sigSort.key
    ? [...displayedSignals].sort((a, b) => {
        const va = sigAccessor(a, sigSort.key), vb = sigAccessor(b, sigSort.key);
        const m = sigSort.dir === 'asc' ? 1 : -1;
        if (va < vb) return -1 * m;
        if (va > vb) return 1 * m;
        return 0;
      })
    : displayedSignals;
  const toggleSigSort = (key) => setSigSort(s =>
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });

  // sentiment distribution has data if any count > 0
  const sentHasData = sentCounts.some(v => v > 0);

  if (loading) return <div className="flex items-center justify-center py-32"><Spinner /></div>;

  const PORTAL_LABELS_INS = {
    order_taking:       'Order Taking',
    complaint_inbound:  'Complaint Inbound',
    complaint_outbound: 'Complaint Outbound',
  };

  return (
    <div className="space-y-6">

      {/* ── Group: Portal tabs ── */}
      {isGroupMode && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setActivePortal(null); setSummary(null); setSignals([]); setCategories([]); setComplaints([]); setMoments([]); setSentimentByAgent([]); }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              activePortal === null
                ? 'bg-primary text-white border-primary'
                : 'border-border text-text-muted hover:border-border2'
            }`}
          >
            All Portals
          </button>
          {livePortals.map(p => (
            <button
              key={p.id}
              onClick={() => { setActivePortal(p.id); setSummary(null); setSignals([]); setCategories([]); setComplaints([]); setMoments([]); setSentimentByAgent([]); }}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                activePortal === p.id
                  ? 'bg-primary text-white border-primary'
                  : 'border-border text-text-muted hover:border-border2'
              }`}
            >
              {PORTAL_LABELS_INS[p.portal_type] || p.name}
            </button>
          ))}
        </div>
      )}

      {/* ── 1. Page Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Signal Intelligence &amp; Insights</h1>
          <p className="text-sm text-text-muted mt-0.5">AI-powered analysis of your {isCaseMode ? 'case interactions' : 'call recordings'}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={handleProcess}
            disabled={processing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '9px 18px',
              borderRadius: '8px',
              border: '1px solid rgb(139, 92, 246)',
              backgroundColor: processing ? 'rgba(139, 92, 246, 0.05)' : 'rgba(139, 92, 246, 0.12)',
              color: processing ? 'rgb(167, 139, 250, 0.6)' : 'rgb(167, 139, 250)',
              fontSize: '13px',
              fontWeight: '600',
              cursor: processing ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {processing ? '⏳ Processing…' : '⚙️ Process Transcripts'}
          </button>
          {processStatus && (
            <span style={{
              fontSize: '11px',
              color: processStatus.includes('Error') ? 'rgb(239, 68, 68)' : 'rgb(16, 185, 129)',
              fontWeight: '500',
            }}>
              {processStatus}
            </span>
          )}
        </div>
      </div>

      {/* ── Channel Filter Tabs (case-mode only) ── */}
      {isCaseMode && (
        <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
          {[
            { key: null,       label: 'All Channels', Icon: null },
            { key: 'voice',    label: 'Voice',        Icon: Phone },
            { key: 'whatsapp', label: 'WhatsApp',     Icon: MessageSquare },
          ].map(({ key, label, Icon }) => (
            <button
              key={String(key)}
              onClick={() => { setChannelFilter(key); setSignalFilter(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                channelFilter === key ? 'bg-primary/20 text-primary-soft font-semibold' : 'text-text-muted hover:text-text-main'
              }`}
            >
              {Icon && <Icon size={12} />}
              {label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-5 py-3 text-sm text-danger">{error}</div>
      )}

      {/* ── 2. KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={isCaseMode ? 'Interactions' : 'Total Calls'}
          value={summary?.total_analysed ?? '—'}
          sub={isCaseMode
            ? (channelFilter ? `${channelFilter.charAt(0).toUpperCase() + channelFilter.slice(1)} interactions` : 'All channels')
            : 'All evaluated calls'}
          accent="purple"
        />

        {/* Avg Sentiment as radial gauge */}
        {(() => {
          const sentVal = summary?.avg_customer_sentiment != null
            ? isCaseMode
              ? Number(summary.avg_customer_sentiment)
              : (Number(summary.avg_customer_sentiment) + 1) * 50
            : null;
          return (
            <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col items-center justify-center hover:border-border2 transition-colors">
              <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-1">Avg Sentiment</div>
              {sentVal != null
                ? <RadialGauge value={sentVal} label="Sentiment" size={130} />
                : <div className="text-2xl font-bold text-text-muted">—</div>}
            </div>
          );
        })()}

        {isCaseMode ? (
          <KpiCard
            label="Escalations"
            value={summary?.escalation_calls ?? '—'}
            sub="Interactions where customer requested escalation"
            accent={Number(summary?.escalation_calls) > 10 ? 'red' : 'amber'}
          />
        ) : (
          <KpiCard
            label="Resolution Rate"
            value={summary?.success_count != null && summary?.total_analysed != null
              ? `${((Number(summary.success_count) / Number(summary.total_analysed)) * 100).toFixed(0)}%`
              : '—'}
            sub="Calls resolved successfully"
            accent="green"
          />
        )}

        {isCaseMode ? (
          <KpiCard
            label="Negative Sentiment"
            value={summary?.negative_calls ?? '—'}
            sub="Interactions with negative customer sentiment"
            accent={Number(summary?.negative_calls) > 20 ? 'red' : 'amber'}
          />
        ) : (
          <KpiCard
            label="Avg Customer Talk %"
            value={summary?.avg_customer_talk_pct != null ? `${Number(summary.avg_customer_talk_pct).toFixed(1)}%` : '—'}
            sub="Portion of call time"
            accent="blue"
          />
        )}
      </div>

      {/* ── 3. Signal Intelligence Grid ── */}
      <CardPanel title="Signal Intelligence" sub="Count of interactions flagged by AI for each signal type. Click a card to filter the table below.">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {SIGNAL_ORDER.map((key) => {
            const cfg = SIGNAL_CONFIGS[key];
            const count = sigCounts[key] ?? sigCounts[SIGNAL_TYPE_MAP[key]] ?? '—';
            return (
              <SignalCard
                key={key}
                emoji={cfg.emoji}
                label={cfg.label}
                count={count}
                colorClass={cfg.color}
                active={signalFilter === key}
                onClick={() => {
                  const next = signalFilter === key ? null : key;
                  setSignalFilter(next);
                  // Both modes: update signalType so API re-fetches with correct filter.
                  // Sentiment-based filters (negative/positive) need separate API call
                  // since default fetch only returns flag-based signals.
                  const apiType = next ? SIGNAL_TYPE_MAP[next] ?? next : 'all';
                  setSignalType(apiType);
                }}
              />
            );
          })}
        </div>

        {/* Case-mode: channel attribution row for signals */}
        {isCaseMode && signalsByChannel.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border">
            <div className="text-[10px] text-text-muted uppercase tracking-widest font-semibold mb-2">Channel breakdown</div>
            <div className="flex flex-wrap gap-4">
              {signalsByChannel.map((row) => {
                const ch = row.channel ?? '—';
                const icon = ch.toLowerCase() === 'voice' ? '📞' : ch.toLowerCase() === 'whatsapp' ? '💬' : '•';
                const label = ch.toLowerCase() === 'voice' ? 'Voice' : ch.toLowerCase() === 'whatsapp' ? 'WhatsApp' : ch;
                return (
                  <div key={ch} className="flex items-center gap-2 text-xs text-text-label">
                    <span className="text-base leading-none">{icon}</span>
                    <span className="font-semibold text-text-main">{label}</span>
                    <span className="text-text-muted">
                      {Number(row.escalations) > 0 && <span className="mr-2">🔺 {row.escalations} escalation{row.escalations !== '1' ? 's' : ''}</span>}
                      {Number(row.threats) > 0 && <span className="mr-2">⚠️ {row.threats} threat{row.threats !== '1' ? 's' : ''}</span>}
                      {Number(row.negative) > 0 && <span className="mr-2">😠 {row.negative} negative</span>}
                      {Number(row.social_media) > 0 && <span className="mr-2">📱 {row.social_media} social</span>}
                      {Number(row.regulatory) > 0 && <span>⚖️ {row.regulatory} regulatory</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {signalFilter && (
          <div className="mt-2 text-xs text-text-muted">
            Filtering by: <span className="text-text-main font-semibold">{SIGNAL_CONFIGS[signalFilter]?.label}</span>
            &nbsp;·&nbsp;
            <button className="underline text-primary-soft" onClick={() => setSignalFilter(null)}>Clear</button>
          </div>
        )}
      </CardPanel>

      {/* ── 5. Flagged Interactions Table ── */}
      <CardPanel
        title={isCaseMode ? 'Flagged Interactions' : 'Flagged Calls'}
        sub={
          signalType === 'negative' ? (isCaseMode ? 'Interactions with Negative customer sentiment.' : 'Calls with Negative customer sentiment.')
          : signalType === 'positive' ? (isCaseMode ? 'Interactions with Positive customer sentiment.' : 'Calls with Positive customer sentiment.')
          : isCaseMode ? 'Interactions where AI detected at least one signal (threat, escalation, social media mention, or regulatory issue).'
          : 'Calls where AI detected at least one signal.'
        }
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Signal type</span>
            <Select id="signal-type-filter" value={signalType} onChange={(e) => {
              setSignalType(e.target.value);
              setSignalFilter(null);
            }}>
              <option value="all">All Flagged</option>
              <option value="threat">Threat</option>
              <option value="social">Social Media</option>
              <option value="escalation">Escalation</option>
              <option value="regulatory">Regulatory</option>
              <option value="negative">Negative Sentiment</option>
              <option value="positive">Positive Sentiment</option>
            </Select>
          </div>
        }
      >
        {finalSignals.length === 0 ? (
          <EmptyState message={`No flagged ${isCaseMode ? 'interactions' : 'calls'} for the selected filter.`} />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[
                    { h: isCaseMode ? 'Case Ref' : 'Call Ref', key: 'ref' },
                    { h: 'Agent', key: 'agent' },
                    { h: isCaseMode ? 'Channel' : 'Date', key: 'channel' },
                    { h: isCaseMode ? 'Type' : 'Category', key: 'type' },
                    { h: 'Flags', key: null },
                    { h: 'Sentiment', key: 'sentiment' },
                    { h: 'Details', key: null },
                  ].map(({ h, key }) => (
                    <th key={h} className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-widest py-2 px-3">
                      {key ? (
                        <button onClick={() => toggleSigSort(key)} className="inline-flex items-center gap-1 uppercase tracking-widest hover:text-text-main transition-colors">
                          {h}<span className="text-[9px] opacity-70">{sigSort.key === key ? (sigSort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </button>
                      ) : h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {finalSignals.map((sig, idx) => {
                  const id = sig.call_id ?? sig.callId ?? sig.id ?? sig._id ?? idx;
                  const isExpanded = expandedCallId === id;
                  const flags = [];
                  if (sig.threat_detected)      flags.push('threat');
                  if (sig.social_media_mention) flags.push('social');
                  if (sig.escalation_request)   flags.push('escalation');
                  if (sig.regulatory_mention)   flags.push('regulatory');
                  const sentiment = sig.customer_sentiment_overall ?? sig.sentiment;
                  const sentColor = sentiment?.toLowerCase?.() === 'positive' ? 'text-green-400' : sentiment?.toLowerCase?.() === 'negative' ? 'text-red-400' : 'text-amber-400';
                  const chanIcon = sig.channel?.toLowerCase?.() === 'voice'
                    ? <Phone size={12} className="inline mr-1 text-text-muted" />
                    : sig.channel?.toLowerCase?.() === 'whatsapp'
                    ? <MessageSquare size={12} className="inline mr-1 text-text-muted" />
                    : null;
                  return (
                    <Fragment key={id}>
                      <tr
                        className={`border-b border-border/50 cursor-pointer transition-colors duration-150 ${isExpanded ? 'bg-primary/5' : 'hover:bg-surface/80'}`}
                        onClick={() => setExpandedCallId(isExpanded ? null : id)}
                      >
                        <td className="py-3 px-3 font-mono text-text-muted text-xs">{sig.call_ref ?? sig.callRef ?? id}</td>
                        <td className="py-3 px-3 text-text-main font-medium">{sig.agent_name ?? sig.agent ?? '—'}</td>
                        <td className="py-3 px-3 text-text-muted">
                          {isCaseMode
                            ? <span className="flex items-center gap-1">{chanIcon}{sig.channel ?? '—'}</span>
                            : (sig.call_date ? new Date(sig.call_date).toLocaleDateString() : '—')}
                        </td>
                        <td className="py-3 px-3 text-text-muted">{sig.call_category ?? sig.category ?? '—'}</td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {flags.length > 0 ? flags.map((f, fi) => <FlagPill key={fi} type={f} />) : <span className="text-text-muted text-xs">—</span>}
                          </div>
                        </td>
                        <td className={`py-3 px-3 font-semibold ${sentColor}`}>{sentiment ?? '—'}</td>
                        <td className="py-3 px-3"><span className="text-primary-soft text-xs font-medium">{isExpanded ? '▲ Hide' : '▼ View'}</span></td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-surface/50">
                          <td colSpan={7} className="px-5 py-4 border-b border-border">
                            <ExpandedCall callId={id} caseMode={isCaseMode} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardPanel>

      {/* ── 6. Chart Row: Call Classification + Sentiment Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardPanel
          title={isCaseMode ? 'Interaction Type Breakdown' : 'Call Classification'}
          sub={isCaseMode ? 'Each slice = number of interactions in that category (Inquiry, Complaint, Billing, etc.), as classified by AI from the transcript.' : 'Distribution of calls by type as classified by AI.'}
        >
          {catLabels.length > 0 ? (
            <DoughnutChart labels={catLabels} data={catCounts} colors={CAT_COLORS.slice(0, catLabels.length)} height={220} />
          ) : (
            <EmptyState message="No classification data." />
          )}
        </CardPanel>
        <CardPanel
          title="Customer Sentiment Distribution"
          sub="AI scores each interaction 0–100 based on the customer's tone and language. Positive ≥65, Neutral 50–64, Mixed 30–49, Negative <30. Each slice = interaction count."
        >
          {sentHasData ? (
            <DoughnutChart labels={sentLabels} data={sentCounts} colors={SENT_COLORS} height={220} />
          ) : (
            <EmptyState message="No sentiment data." />
          )}
        </CardPanel>
      </div>

      {/* ── 7. Standard-mode only: Call Outcomes ── */}
      {!isCaseMode && outCounts.some(v => v > 0) && (
        <CardPanel title="Call Outcomes">
          <DoughnutChart labels={outLabels} data={outCounts} colors={OUT_COLORS} height={220} />
        </CardPanel>
      )}

      {/* ── 8. Case-mode: Product Classification + Top Issues ── */}
      {isCaseMode && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CardPanel
            title="Issue Category Breakdown"
            sub="Interactions grouped into 8 buckets based on AI-extracted subcategory keywords (e.g. 'refund', 'hotel', 'baggage'). Count = number of interactions per bucket."
          >
            {ptLabels.length > 0 ? (
              <DoughnutChart labels={ptLabels} data={ptCounts} colors={PRODUCT_COLORS.slice(0, ptLabels.length)} height={220} />
            ) : (
              <EmptyState message="No product classification data yet." />
            )}
          </CardPanel>
          <CardPanel
            title="Top Issue Categories"
            sub="Same 8 buckets as the pie chart, ranked by interaction count. Higher bar = more customer interactions about that issue type."
          >
            {issueLabels.length > 0 ? (
              <RankedBarChart
                items={complaints.slice(0, 8).map((c) => ({
                  label: c.complaint ?? c.text ?? '',
                  value: Number(c.frequency ?? c.count ?? 0),
                }))}
                color={ISSUE_COLORS}
              />
            ) : (
              <EmptyState message="No issues data yet." />
            )}
          </CardPanel>
        </div>
      )}

      {/* ── 9. Top Complaints ── */}
      {!isCaseMode && (
        <CardPanel title="Top Complaints" sub="How many times each complaint phrase appeared across all analysed calls.">
          {complaints.length === 0 ? (
            <EmptyState message="No complaint data." />
          ) : (
            <RankedBarChart
              items={complaints.slice(0, 12).map((c) => ({ label: c.complaint ?? c.text ?? c._id ?? 'Unknown', value: c.frequency ?? c.count ?? 0 }))}
              color={['#EF4444','#F97316','#F59E0B','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#6366F1','#84CC16','#06B6D4','#A78BFA','#FB923C']}
              seriesName="Frequency"
            />
          )}
        </CardPanel>
      )}

      {/* ── 10. Channel Sentiment Comparison (case-mode only) ── */}
      {isCaseMode && <ChannelSentimentCard channelSentiment={channelSentiment} />}

      {/* ── 11. Agent Performance Table ── */}
      <CardPanel
        title="Agent Performance"
        sub="Ranked by avg customer sentiment. Resolution rate = % of calls the agent resolved. Green ≥80%, Amber 60–79%, Red <60%."
      >
        <AgentPerformanceTable agents={sentimentByAgent} isCaseMode={isCaseMode} />
      </CardPanel>

      {/* ── 12. Standard-mode only: Location Mentions ── */}
      {!isCaseMode && locLabels.length > 0 && (
        <CardPanel title="Location Mentions">
          <BarChart labels={locLabels} data={locCounts} colors="#3B82F6" height={220} horizontal={false} />
        </CardPanel>
      )}

    </div>
  );
}
