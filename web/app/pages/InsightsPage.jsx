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
            {transcriptStr}
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

  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [signalType, setSignalType]         = useState('all');
  const [signalFilter, setSignalFilter]     = useState(null);
  const [processing, setProcessing]         = useState(false);
  const [processStatus, setProcessStatus]   = useState('');
  const [expandedCallId, setExpandedCallId] = useState(null);
  const [deletingCallId, setDeletingCallId] = useState(null);
  const [channelFilter, setChannelFilter]   = useState(null);

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
      const params = new URLSearchParams();
      if (type && type !== 'all') params.append('type', type);
      if (globalDateFrom) params.append('from', globalDateFrom);
      if (globalDateTo)   params.append('to', globalDateTo + ' 23:59:59');
      if (isCaseMode && channelFilter) params.append('channel', channelFilter);
      const qs = params.toString();
      const endpoint = isCaseMode ? `/api/cases/insights/all${qs ? '?' + qs : ''}` : `/api/insights/signals${qs ? '?' + qs : ''}`;
      const data = await apiFetch(endpoint);
      setSignals(Array.isArray(data) ? data : data.signals ?? []);
    } catch (_) {}
  }, [apiFetch, globalDateFrom, globalDateTo, isCaseMode, channelFilter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qp = new URLSearchParams();
    if (globalDateFrom) qp.append('from', globalDateFrom);
    if (globalDateTo)   qp.append('to', globalDateTo + ' 23:59:59');
    if (isCaseMode && channelFilter) qp.append('channel', channelFilter);
    const qs = qp.toString() ? `?${qp.toString()}` : '';
    apiFetch(isCaseMode ? `/api/cases/insights/all${qs}` : `/api/insights/all${qs}`)
      .then((d) => {
        if (cancelled) return;
        if (d.summary)          setSummary(d.summary);
        if (d.categories)       setCategories(d.categories);
        if (d.signals)          setSignals(d.signals);
        if (d.complaints)       setComplaints(d.complaints);
        if (d.moments)          setMoments(d.moments);
        if (d.sentimentByAgent) setSentimentByAgent(d.sentimentByAgent);
        if (d.locations)        setLocations(d.locations);
        if (d.products)         setProducts(d.products);
        if (d.productTypes)     setProductTypes(d.productTypes);
        if (d.channelSentiment)  setChannelSentiment(d.channelSentiment);
        if (d.fcrData)           setFcrData(d.fcrData);
        if (d.signalsByChannel)  setSignalsByChannel(d.signalsByChannel);
        setLoading(false);
      })
      .catch((e) => { if (cancelled) return; setError(e.message); setLoading(false); });
    return () => { cancelled = true; };
  }, [apiFetch, globalDateFrom, globalDateTo, isCaseMode, channelFilter]);

  useEffect(() => {
    if (!loading) fetchSignals(signalType);
  }, [signalType, loading, fetchSignals]);

  const handleProcess = useCallback(async () => {
    setProcessing(true);
    setProcessStatus('Processing…');
    try {
      const data = await apiFetch(isCaseMode ? '/api/cases/insights/process' : '/api/insights/process', { method: 'POST' });
      setProcessStatus(data?.message ?? 'Processing started.');
    } catch (err) {
      setProcessStatus('Error: ' + (err.message || 'Failed'));
    } finally {
      setProcessing(false);
    }
  }, [apiFetch, isCaseMode]);

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

  // sentiment distribution has data if any count > 0
  const sentHasData = sentCounts.some(v => v > 0);

  if (loading) return <div className="flex items-center justify-center py-32"><Spinner /></div>;

  return (
    <div className="space-y-6">

      {/* ── 1. Page Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Signal Intelligence &amp; Insights</h1>
          <p className="text-sm text-text-muted mt-0.5">AI-powered analysis of your {isCaseMode ? 'case interactions' : 'call recordings'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button id="process-transcripts-btn" variant="primary" onClick={handleProcess} disabled={processing} className="flex items-center gap-2">
            {processing
              ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              : <span>⚙</span>}
            {isCaseMode ? 'Process Case Insights' : 'Process Transcripts'}
          </Button>
          {processStatus && <span className="text-xs text-text-muted">{processStatus}</span>}
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
        {displayedSignals.length === 0 ? (
          <EmptyState message={`No flagged ${isCaseMode ? 'interactions' : 'calls'} for the selected filter.`} />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[isCaseMode ? 'Case Ref' : 'Call Ref', 'Agent', isCaseMode ? 'Channel' : 'Date', isCaseMode ? 'Type' : 'Category', 'Flags', 'Sentiment', 'Details', ''].map((h) => (
                    <th key={h} className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-widest py-2 px-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedSignals.map((sig, idx) => {
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
                        <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={(e) => deleteCall(id, e)}
                            disabled={deletingCallId === id}
                            title={isCaseMode ? 'Delete this interaction' : 'Delete this call'}
                            style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, backgroundColor: deletingCallId === id ? '#374151' : 'rgba(239,68,68,0.1)', color: deletingCallId === id ? '#6b7280' : '#f87171', border: '1px solid rgba(239,68,68,0.3)', cursor: deletingCallId === id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                          >
                            {deletingCallId === id ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-surface/50">
                          <td colSpan={8} className="px-5 py-4 border-b border-border">
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

      {/* ── 7. Standard-mode only: Outcomes + Talk Time ── */}
      {!isCaseMode && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CardPanel title="Call Outcomes">
            {outCounts.some(v => v > 0) ? (
              <DoughnutChart labels={outLabels} data={outCounts} colors={OUT_COLORS} height={220} />
            ) : (
              <EmptyState message="No outcomes data." />
            )}
          </CardPanel>
          <CardPanel title="Talk Time Distribution">
            <DoughnutChart labels={talkLabels} data={talkData} colors={TALK_COLORS} height={220} />
          </CardPanel>
        </div>
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

      {/* ── 9. Top Complaints + Key Moment Types ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {!isCaseMode && (
          <CardPanel title="Top Complaints">
            {complaints.length === 0 ? (
              <EmptyState message="No complaint data." />
            ) : (
              <RankedBarChart
                items={complaints.slice(0, 12).map((c) => ({ label: c.complaint ?? c.text ?? c._id ?? 'Unknown', value: c.frequency ?? c.count ?? 0 }))}
                color={['#EF4444','#F97316','#F59E0B','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#6366F1','#84CC16','#06B6D4','#A78BFA','#FB923C']}
              />
            )}
          </CardPanel>
        )}
        <CardPanel
          title="Key Moment Types"
          sub="AI identifies notable moments in each transcript (e.g. Customer Complaint, Hold, Escalation). Count = total occurrences across all interactions."
        >
          {moments.length === 0 ? (
            <EmptyState message="No key moment data." />
          ) : (
            <RankedBarChart
              items={moments.map((m) => ({ label: m.moment_type ?? m.type ?? m.label ?? m._id ?? 'Unknown', value: m.frequency ?? m.count ?? 0 }))}
              color="#8B5CF6"
            />
          )}
        </CardPanel>
        {isCaseMode && <div />}{/* spacer to keep 2-col grid aligned when only 1 item */}
      </div>

      {/* ── 10. Channel Sentiment Comparison (case-mode only) ── */}
      {isCaseMode && <ChannelSentimentCard channelSentiment={channelSentiment} />}

      {/* ── 11. Sentiment by Agent ── */}
      <CardPanel title="Sentiment by Agent" sub="Each bar = average AI customer sentiment score (0–100) for that agent across all their interactions. Green ≥65, Amber 45–64, Red <45.">
        {sentimentByAgent.length === 0 ? (
          <EmptyState message="No agent sentiment data." />
        ) : (
          <div className="space-y-3">
            {sentimentByAgent.map((a, i) => (
              <SentimentBar
                key={i}
                agentName={a.agent_name ?? a.agent ?? a.name ?? a._id ?? `Agent ${i + 1}`}
                score={
                  a.avg_customer_sentiment != null
                    ? isCaseMode
                      ? Number(a.avg_customer_sentiment)
                      : Number(a.avg_customer_sentiment) * 100 + 50
                    : 50
                }
              />
            ))}
          </div>
        )}
      </CardPanel>

      {/* ── 12. Standard-mode only: Location + Product Charts ── */}
      {!isCaseMode && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CardPanel title="Location Mentions">
            {locLabels.length > 0 ? (
              <BarChart labels={locLabels} data={locCounts} colors="#3B82F6" height={220} horizontal={false} />
            ) : (
              <EmptyState message="No location data." />
            )}
          </CardPanel>
          <CardPanel title="Product / SKU Mentions">
            {prodLabels.length > 0 ? (
              <BarChart labels={prodLabels} data={prodCounts} colors="#8B5CF6" height={220} horizontal={false} />
            ) : (
              <EmptyState message="No product data." />
            )}
          </CardPanel>
        </div>
      )}

    </div>
  );
}
