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

function resolutionAccent(rate) {
  if (rate == null) return 'purple';
  if (rate >= 75) return 'green';
  if (rate >= 50) return 'amber';
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
  const leftWidth = pct;
  const rightWidth = 100 - pct;

  return (
    <div className="flex items-center gap-3">
      <div className="w-28 truncate text-xs text-text-muted text-right">{agentName}</div>
      <div className="flex-1 flex items-center gap-0 rounded-full overflow-hidden bg-border h-3">
        <div style={{ width: `${leftWidth}%`, background: barColor, height: '100%', transition: 'width 0.6s' }} />
        <div style={{ width: `${rightWidth}%`, height: '100%' }} />
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
      <div className={`text-2xl font-bold leading-none ${colorClass.text}`}>
        {count ?? '—'}
      </div>
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
  threats: 'threat',
  social: 'social',
  escalations: 'escalation',
  regulatory: 'regulatory',
  negative: 'negative',
  positive: 'positive',
};

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

  // Case mode: flat row from case_interactions + case_insights join
  // Standard mode: { insight: {}, transcript: {} } shape
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
      {/* Summary */}
      {insight.summary && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Summary</div>
          <p className="text-text-main leading-relaxed">{insight.summary}</p>
        </div>
      )}

      {/* Why flagged */}
      {(insight.threat_details || insight.escalation_details || insight.social_media_details || insight.regulatory_details) && (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Why Flagged</div>
          {insight.threat_details && <p className="text-red-400 leading-relaxed text-xs"><strong>Threat:</strong> {insight.threat_details}</p>}
          {insight.escalation_details && <p className="text-amber-400 leading-relaxed text-xs"><strong>Escalation:</strong> {insight.escalation_details}</p>}
          {insight.social_media_details && <p className="text-blue-400 leading-relaxed text-xs"><strong>Social:</strong> {insight.social_media_details}</p>}
          {insight.regulatory_details && <p className="text-purple-400 leading-relaxed text-xs"><strong>Regulatory:</strong> {insight.regulatory_details}</p>}
        </div>
      )}

      {/* Key moments timeline */}
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

      {/* Outcome / Category */}
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

      {/* Transcript */}
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

  // ── data state ──
  const [summary, setSummary]               = useState(null);
  const [categories, setCategories]         = useState([]);
  const [signals, setSignals]               = useState([]);
  const [complaints, setComplaints]         = useState([]);
  const [moments, setMoments]               = useState([]);
  const [sentimentByAgent, setSentimentByAgent] = useState([]);
  const [locations, setLocations]           = useState([]);
  const [products, setProducts]             = useState([]);
  const [productTypes, setProductTypes]     = useState([]);

  // ── UI state ──
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [signalType, setSignalType]         = useState('all');
  const [signalFilter, setSignalFilter]     = useState(null); // grid-card filter
  const [processing, setProcessing]         = useState(false);
  const [processStatus, setProcessStatus]   = useState('');
  const [expandedCallId, setExpandedCallId] = useState(null);
  const [deletingCallId, setDeletingCallId] = useState(null);
  // case-mode channel filter: null = all, 'voice', 'whatsapp'
  const [channelFilter, setChannelFilter]   = useState(null);

  // ── delete a single call ──
  const deleteCall = useCallback(async (callId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this call and all its data? This cannot be undone.')) return;
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

  // ── fetch signals when type or date changes ──
  const fetchSignals = useCallback(async (type) => {
    try {
      const params = new URLSearchParams();
      if (type && type !== 'all') params.append('type', type);
      if (globalDateFrom) { params.append('from', globalDateFrom); }
      if (globalDateTo)   { params.append('to', globalDateTo + ' 23:59:59'); }
      if (isCaseMode && channelFilter) params.append('channel', channelFilter);
      const qs = params.toString();
      const endpoint = isCaseMode ? `/api/cases/insights/all${qs ? '?' + qs : ''}` : `/api/insights/signals${qs ? '?' + qs : ''}`;
      const data = await apiFetch(endpoint);
      setSignals(Array.isArray(data) ? data : data.signals ?? []);
    } catch (_) {}
  }, [apiFetch, globalDateFrom, globalDateTo, isCaseMode, channelFilter]);

  // ── initial fetch — single aggregated call ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qp = new URLSearchParams();
    if (globalDateFrom) { qp.append('from', globalDateFrom); }
    if (globalDateTo)   { qp.append('to', globalDateTo + ' 23:59:59'); }
    if (isCaseMode && channelFilter) qp.append('channel', channelFilter);
    const qs = qp.toString() ? `?${qp.toString()}` : '';

    apiFetch(isCaseMode ? `/api/cases/insights/all${qs}` : `/api/insights/all${qs}`)
      .then((d) => {
        if (cancelled) return;
        if (d.summary)         setSummary(d.summary);
        if (d.categories)      setCategories(d.categories);
        if (d.signals)         setSignals(d.signals);
        if (d.complaints)      setComplaints(d.complaints);
        if (d.moments)         setMoments(d.moments);
        if (d.sentimentByAgent) setSentimentByAgent(d.sentimentByAgent);
        if (d.locations)       setLocations(d.locations);
        if (d.products)        setProducts(d.products);
        if (d.productTypes)    setProductTypes(d.productTypes);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [apiFetch, globalDateFrom, globalDateTo, isCaseMode, channelFilter]);

  // ── signal filters (table) ──
  useEffect(() => {
    if (!loading) fetchSignals(signalType);
  }, [signalType, loading, fetchSignals]);

  // ── process transcripts ──
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
  }, [apiFetch]);

  // ── derived chart data ──
  // ── derived chart data ──
  const catLabels    = categories.map((c) => c.call_subcategory ?? c.call_category ?? c.category ?? c.name ?? 'Other');
  const catCounts    = categories.map((c) => Number(c.count ?? 0));
  const CAT_COLORS   = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6'];

  const sentLabels   = ['Positive', 'Neutral', 'Mixed', 'Negative'];
  const sentCounts   = [
    Number(summary?.positive_calls || 0),
    Number(summary?.neutral_calls || 0),
    Number(summary?.mixed_calls || 0),
    Number(summary?.negative_calls || 0)
  ];
  const SENT_COLORS  = ['#22C55E', '#F59E0B', '#8B5CF6', '#EF4444'];

  const outLabels    = ['Resolved', 'Unresolved', 'Escalated'];
  const outCounts    = [
    Number(summary?.resolved_calls || 0),
    Number(summary?.unresolved_calls || 0),
    Number(summary?.escalated_calls || 0)
  ];
  const OUT_COLORS   = ['#22C55E', '#EF4444', '#F59E0B'];

  // Talk% — API returns avg_customer_talk_pct (snake_case)
  const talkLabels   = ['Agent Talk', 'Customer Talk'];
  const talkData     = [
    100 - Number(summary?.avg_customer_talk_pct ?? 50),
    Number(summary?.avg_customer_talk_pct ?? 50),
  ];
  const TALK_COLORS  = ['#8B5CF6', '#3B82F6'];

  const locLabels    = locations.slice(0, 12).map((l) => l.location ?? l.name ?? l._id ?? '');
  const locCounts    = locations.slice(0, 12).map((l) => Number(l.call_count ?? l.count ?? 0));
  const prodLabels   = products.slice(0, 12).map((p) => p.product ?? p.name ?? p._id ?? '');
  const prodCounts   = products.slice(0, 12).map((p) => Number(p.frequency ?? p.count ?? 0));

  // Case-mode: product types (call_subcategory breakdown)
  const PRODUCT_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1', '#84CC16'];
  const ptLabels = productTypes.map((p) => p.product_type ?? '');
  const ptCounts = productTypes.map((p) => Number(p.count ?? 0));

  // Case-mode: top issues pie (use complaints data)
  const ISSUE_COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#8B5CF6', '#10B981', '#EC4899', '#14B8A6', '#F97316'];
  const issueLabels = complaints.slice(0, 8).map((c) => c.complaint ?? c.text ?? '');
  const issueCounts = complaints.slice(0, 8).map((c) => Number(c.frequency ?? c.count ?? 0));

  // signal grid counts from summary — API uses snake_case
  const sigCounts = {
    threats: summary?.threat_calls,
    social: summary?.social_media_calls,
    escalations: summary?.escalation_calls,
    regulatory: summary?.regulatory_calls,
    negative: summary?.negative_calls,
    positive: summary?.positive_calls,
  };
  const SIGNAL_ORDER = ['threats', 'social', 'escalations', 'regulatory', 'negative', 'positive'];

  // filtered signals for table
  // filtered signals for table
  const displayedSignals = signalFilter
    ? signals.filter((s) => {
        const types = [];
        if (s.threat_detected) types.push('threat');
        if (s.social_media_mention) types.push('social');
        if (s.escalation_request) types.push('escalation');
        if (s.regulatory_mention) types.push('regulatory');
        return types.includes(SIGNAL_TYPE_MAP[signalFilter]);
      })
    : signals;

  // ── render ──
  if (loading) return <div className="flex items-center justify-center py-32"><Spinner /></div>;

  return (
    <div className="space-y-6">

      {/* ── 1. Page Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">Signal Intelligence &amp; Insights</h1>
          <p className="text-sm text-text-muted mt-0.5">AI-powered analysis of your call recordings</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            id="process-transcripts-btn"
            variant="primary"
            onClick={handleProcess}
            disabled={processing}
            className="flex items-center gap-2"
          >
            {processing ? (
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <span>⚙</span>
            )}
            {isCaseMode ? 'Process Case Insights' : 'Process Transcripts'}
          </Button>
          {processStatus && (
            <span className="text-xs text-text-muted">{processStatus}</span>
          )}
        </div>
      </div>

      {/* ── Channel Filter Tabs (case-mode only) ── */}
      {isCaseMode && (
        <div className="flex gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
          {[
            { key: null,         label: 'All Channels', Icon: null },
            { key: 'voice',      label: 'Voice',        Icon: Phone },
            { key: 'whatsapp',   label: 'WhatsApp',     Icon: MessageSquare },
          ].map(({ key, label, Icon }) => (
            <button
              key={String(key)}
              onClick={() => { setChannelFilter(key); setSignalFilter(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                channelFilter === key
                  ? 'bg-primary/20 text-primary-soft font-semibold'
                  : 'text-text-muted hover:text-text-main'
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

        {/* Sentiment as radial gauge */}
        {(() => {
          const sentVal = summary?.avg_customer_sentiment != null
            ? isCaseMode
              ? Number(summary.avg_customer_sentiment)
              : Number(summary.avg_customer_sentiment) * 100
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

        <KpiCard
          label="Resolution Rate"
          value={summary?.success_count != null && summary?.total_analysed != null
            ? `${((Number(summary.success_count) / Number(summary.total_analysed)) * 100).toFixed(0)}%`
            : '—'}
          sub="Calls resolved successfully"
          accent={resolutionAccent(
            summary?.success_count != null && summary?.total_analysed != null
              ? (Number(summary.success_count) / Number(summary.total_analysed)) * 100
              : null
          )}
        />
        <KpiCard
          label="Avg Customer Talk %"
          value={summary?.avg_customer_talk_pct != null ? `${Number(summary.avg_customer_talk_pct).toFixed(1)}%` : '—'}
          sub="Portion of call time"
          accent="blue"
        />
      </div>

      {/* ── 3. Signal Intelligence Grid ── */}
      <CardPanel title="Signal Intelligence">
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
                onClick={() => setSignalFilter(signalFilter === key ? null : key)}
              />
            );
          })}
        </div>
        {signalFilter && (
          <div className="mt-2 text-xs text-text-muted">
            Filtering table by: <span className="text-text-main font-semibold">{SIGNAL_CONFIGS[signalFilter]?.label}</span>
            &nbsp;·&nbsp;
            <button className="underline text-primary-soft" onClick={() => setSignalFilter(null)}>Clear filter</button>
          </div>
        )}
      </CardPanel>

      {/* ── 4. Flagged Calls Table ── */}
      <CardPanel
        title="Flagged Calls"
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Signal type</span>
            <Select
              id="signal-type-filter"
              value={signalType}
              onChange={(e) => setSignalType(e.target.value)}
            >
              <option value="all">All</option>
              <option value="threat">Threat</option>
              <option value="social">Social Media</option>
              <option value="escalation">Escalation</option>
              <option value="regulatory">Regulatory</option>
            </Select>
          </div>
        }
      >
        {displayedSignals.length === 0 ? (
          <EmptyState message="No flagged calls for the selected filter." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {[isCaseMode ? 'Case Ref' : 'Call Ref', 'Agent', isCaseMode ? 'Channel' : 'Date', 'Category', 'Flags', 'Sentiment', 'Details', ''].map((h) => (
                    <th key={h} className="text-left text-[10px] font-semibold text-text-muted uppercase tracking-widest py-2 px-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedSignals.map((sig, idx) => {
                  const id = sig.call_id ?? sig.callId ?? sig.id ?? sig._id ?? idx;
                  const isExpanded = expandedCallId === id;
                  const flags = [];
                  if (sig.threat_detected) flags.push('threat');
                  if (sig.social_media_mention) flags.push('social');
                  if (sig.escalation_request) flags.push('escalation');
                  if (sig.regulatory_mention) flags.push('regulatory');

                  const sentiment = sig.customer_sentiment_overall ?? sig.sentiment;
                  const sentColor =
                    sentiment?.toLowerCase?.() === 'positive' ? 'text-green-400' :
                    sentiment?.toLowerCase?.() === 'negative' ? 'text-red-400' :
                    'text-amber-400';

                  const chanIcon = sig.channel?.toLowerCase?.() === 'voice'
                    ? <Phone size={12} className="inline mr-1 text-text-muted" />
                    : sig.channel?.toLowerCase?.() === 'whatsapp'
                    ? <MessageSquare size={12} className="inline mr-1 text-text-muted" />
                    : null;

                  return (
                    <Fragment key={id}>
                      <tr
                        key={`row-${id}`}
                        className={`border-b border-border/50 cursor-pointer transition-colors duration-150
                          ${isExpanded ? 'bg-primary/5' : 'hover:bg-surface/80'}`}
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
                            {flags.length > 0
                              ? flags.map((f, fi) => <FlagPill key={fi} type={f} />)
                              : <span className="text-text-muted text-xs">—</span>}
                          </div>
                        </td>
                        <td className={`py-3 px-3 font-semibold ${sentColor}`}>
                          {sentiment ?? '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-primary-soft text-xs font-medium">
                            {isExpanded ? '▲ Hide' : '▼ View'}
                          </span>
                        </td>
                        <td className="py-3 px-3" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={(e) => deleteCall(id, e)}
                            disabled={deletingCallId === id}
                            title="Delete this call"
                            style={{
                              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              backgroundColor: deletingCallId === id ? '#374151' : 'rgba(239,68,68,0.1)',
                              color: deletingCallId === id ? '#6b7280' : '#f87171',
                              border: '1px solid rgba(239,68,68,0.3)',
                              cursor: deletingCallId === id ? 'not-allowed' : 'pointer',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {deletingCallId === id ? '…' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`expanded-${id}`} className="bg-surface/50">
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

      {/* ── 5. Chart Row 1: Classification + Sentiment Distribution ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardPanel title="Call Classification">
          {catLabels.length > 0 ? (
            <DoughnutChart
              labels={catLabels}
              data={catCounts}
              colors={CAT_COLORS.slice(0, catLabels.length)}
              height={220}
            />
          ) : (
            <EmptyState message="No classification data." />
          )}
        </CardPanel>
        <CardPanel title="Customer Sentiment Distribution">
          {sentLabels.length > 0 ? (
            <DoughnutChart
              labels={sentLabels}
              data={sentCounts}
              colors={SENT_COLORS.slice(0, sentLabels.length)}
              height={220}
            />
          ) : (
            <EmptyState message="No sentiment distribution data." />
          )}
        </CardPanel>
      </div>

      {/* ── 6. Chart Row 2: Outcomes + Talk Time ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardPanel title="Call Outcomes">
          {outLabels.length > 0 ? (
            <DoughnutChart
              labels={outLabels}
              data={outCounts}
              colors={OUT_COLORS.slice(0, outLabels.length)}
              height={220}
            />
          ) : (
            <EmptyState message="No outcomes data." />
          )}
        </CardPanel>
        <CardPanel title="Talk Time Distribution">
          <DoughnutChart
            labels={talkLabels}
            data={talkData}
            colors={TALK_COLORS}
            height={220}
          />
        </CardPanel>
      </div>

      {/* ── 7. Top Complaints + Key Moment Types ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardPanel title="Top Complaints">
          {complaints.length === 0 ? (
            <EmptyState message="No complaint data." />
          ) : (
            <RankedBarChart
              items={complaints.slice(0, 12).map((c) => ({
                label: c.complaint ?? c.text ?? c._id ?? 'Unknown',
                value: c.frequency ?? c.count ?? 0,
              }))}
              color={['#EF4444','#F97316','#F59E0B','#3B82F6','#8B5CF6','#EC4899','#14B8A6','#6366F1','#84CC16','#06B6D4','#A78BFA','#FB923C']}
            />
          )}
        </CardPanel>

        <CardPanel title="Key Moment Types">
          {moments.length === 0 ? (
            <EmptyState message="No key moment data." />
          ) : (
            <RankedBarChart
              items={moments.map((m) => ({
                label: m.moment_type ?? m.type ?? m.label ?? m._id ?? 'Unknown',
                value: m.frequency ?? m.count ?? 0,
              }))}
              color="#8B5CF6"
            />
          )}
        </CardPanel>
      </div>

      {/* ── 8. Sentiment by Agent ── */}
      <CardPanel title="Sentiment by Agent">
        {sentimentByAgent.length === 0 ? (
          <EmptyState message="No agent sentiment data." />
        ) : (
          <div className="space-y-3">
            {sentimentByAgent.map((a, i) => (
              <SentimentBar
                key={i}
                agentName={a.agent_name ?? a.agent ?? a.name ?? a._id ?? `Agent ${i + 1}`}
                score={(
                  a.avg_customer_sentiment != null
                    ? isCaseMode
                      ? Number(a.avg_customer_sentiment)            // already 0..100
                      : Number(a.avg_customer_sentiment) * 100 + 50 // normalize -1..1 -> 0..100
                    : 50
                )}
              />
            ))}
          </div>
        )}
      </CardPanel>

      {/* ── 9. Case-mode: Product Classification + Top Issues ── */}
      {isCaseMode && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CardPanel title="Product Classification">
            {ptLabels.length > 0 ? (
              <DoughnutChart
                labels={ptLabels}
                data={ptCounts}
                colors={PRODUCT_COLORS.slice(0, ptLabels.length)}
                height={220}
              />
            ) : (
              <EmptyState message="No product classification data yet. Process insights to populate." />
            )}
          </CardPanel>
          <CardPanel title="Top Issues">
            {issueLabels.length > 0 ? (
              <DoughnutChart
                labels={issueLabels}
                data={issueCounts}
                colors={ISSUE_COLORS.slice(0, issueLabels.length)}
                height={220}
              />
            ) : (
              <EmptyState message="No issues data yet." />
            )}
          </CardPanel>
        </div>
      )}

      {/* ── 10. Location + Product Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardPanel title="Location Mentions">
          {locLabels.length > 0 ? (
            <BarChart
              labels={locLabels}
              data={locCounts}
              colors="#3B82F6"
              height={220}
              horizontal={false}
            />
          ) : (
            <EmptyState message="No location data." />
          )}
        </CardPanel>
        <CardPanel title="Product / SKU Mentions">
          {prodLabels.length > 0 ? (
            <BarChart
              labels={prodLabels}
              data={prodCounts}
              colors="#8B5CF6"
              height={220}
              horizontal={false}
            />
          ) : (
            <EmptyState message="No product data." />
          )}
        </CardPanel>
      </div>
    </div>
  );
}
