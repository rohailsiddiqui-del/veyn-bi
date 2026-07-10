'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { KpiCard, CardPanel, Badge, Button, Select, Spinner, EmptyState } from '@/app/components/ui';
import { DoughnutChart, BarChart } from '@/app/components/Charts';

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

function ExpandedCall({ callId }) {
  const { apiFetch } = useAuth();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    apiFetch(`/api/insights/call/${callId}/full`)
      .then((d) => { if (!cancelled) { setDetail(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setErr(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [callId, apiFetch]);

  if (loading) return <div className="py-4"><Spinner /></div>;
  if (err) return <div className="py-3 text-sm text-danger">Failed to load: {err}</div>;
  if (!detail) return null;

  const moments = detail.moments ?? detail.keyMoments ?? detail.key_moments ?? [];

  return (
    <div className="space-y-4 text-sm">
      {/* Summary */}
      {detail.summary && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Summary</div>
          <p className="text-text-main leading-relaxed">{detail.summary}</p>
        </div>
      )}

      {/* Why flagged */}
      {(detail.threat_details || detail.escalation_details || detail.social_media_details || detail.regulatory_details) && (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Why Flagged</div>
          {detail.threat_details && <p className="text-red-400 leading-relaxed text-xs"><strong>Threat:</strong> {detail.threat_details}</p>}
          {detail.escalation_details && <p className="text-amber-400 leading-relaxed text-xs"><strong>Escalation:</strong> {detail.escalation_details}</p>}
          {detail.social_media_details && <p className="text-blue-400 leading-relaxed text-xs"><strong>Social:</strong> {detail.social_media_details}</p>}
          {detail.regulatory_details && <p className="text-purple-400 leading-relaxed text-xs"><strong>Regulatory:</strong> {detail.regulatory_details}</p>}
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
      {(detail.call_outcome || detail.call_category) && (
        <div className="flex gap-4 flex-wrap">
          {detail.call_category && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Category</div>
              <Badge variant="info">{detail.call_category}</Badge>
            </div>
          )}
          {detail.call_outcome && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-1">Outcome</div>
              <Badge variant="default">{detail.call_outcome}</Badge>
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      {detail.transcript && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-text-muted font-semibold mb-2">Transcript</div>
          <div className="max-h-64 overflow-y-auto rounded-lg bg-surface border border-border p-3 font-mono text-xs text-text-muted whitespace-pre-wrap leading-relaxed">
            {detail.transcript}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { apiFetch, globalDate } = useAuth();

  // ── data state ──
  const [summary, setSummary]               = useState(null);
  const [categories, setCategories]         = useState([]);
  const [signals, setSignals]               = useState([]);
  const [complaints, setComplaints]         = useState([]);
  const [moments, setMoments]               = useState([]);
  const [sentimentByAgent, setSentimentByAgent] = useState([]);
  const [locations, setLocations]           = useState([]);
  const [products, setProducts]             = useState([]);

  // ── UI state ──
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [signalType, setSignalType]         = useState('all');
  const [signalFilter, setSignalFilter]     = useState(null); // grid-card filter
  const [processing, setProcessing]         = useState(false);
  const [processStatus, setProcessStatus]   = useState('');
  const [expandedCallId, setExpandedCallId] = useState(null);

  // ── fetch signals when type or date changes ──
  const fetchSignals = useCallback(async (type) => {
    try {
      const params = new URLSearchParams();
      if (type && type !== 'all') params.append('type', type);
      if (globalDate) {
        params.append('from', globalDate);
        params.append('to', globalDate + ' 23:59:59');
      }
      const qs = params.toString();
      const data = await apiFetch(`/api/insights/signals${qs ? '?' + qs : ''}`);
      setSignals(Array.isArray(data) ? data : data.signals ?? []);
    } catch (_) {}
  }, [apiFetch, globalDate]);

  // ── initial parallel fetch ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const qs = globalDate ? `?from=${globalDate}&to=${globalDate} 23:59:59` : '';
    const qsAnd = globalDate ? `&from=${globalDate}&to=${globalDate} 23:59:59` : '';

    Promise.allSettled([
      apiFetch(`/api/insights/summary${qs}`),
      apiFetch(`/api/insights/categories${qs}`),
      apiFetch(`/api/insights/signals${qs}`),
      apiFetch(`/api/insights/complaints?limit=15${qsAnd}`),
      apiFetch(`/api/insights/moments${qs}`),
      apiFetch(`/api/insights/sentiment-by-agent${qs}`),
      apiFetch(`/api/insights/locations${qs}`),
      apiFetch(`/api/insights/products${qs}`),
    ]).then(([s, cat, sig, comp, mom, sba, loc, prod]) => {
      if (cancelled) return;

      if (s.status === 'fulfilled')   setSummary(s.value);
      if (cat.status === 'fulfilled') setCategories(Array.isArray(cat.value) ? cat.value : cat.value?.categories ?? []);
      if (sig.status === 'fulfilled') setSignals(Array.isArray(sig.value) ? sig.value : sig.value?.signals ?? []);
      if (comp.status === 'fulfilled') setComplaints(Array.isArray(comp.value) ? comp.value : comp.value?.complaints ?? []);
      if (mom.status === 'fulfilled') setMoments(Array.isArray(mom.value) ? mom.value : mom.value?.moments ?? []);
      if (sba.status === 'fulfilled') setSentimentByAgent(Array.isArray(sba.value) ? sba.value : sba.value?.agents ?? []);
      if (loc.status === 'fulfilled') setLocations(Array.isArray(loc.value) ? loc.value : loc.value?.locations ?? []);
      if (prod.status === 'fulfilled') setProducts(Array.isArray(prod.value) ? prod.value : prod.value?.products ?? []);

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [apiFetch, globalDate]);

  // ── signal filters (table) ──
  useEffect(() => {
    if (!loading) fetchSignals(signalType);
  }, [signalType, loading, fetchSignals]);

  // ── process transcripts ──
  const handleProcess = useCallback(async () => {
    setProcessing(true);
    setProcessStatus('Processing…');
    try {
      const data = await apiFetch('/api/insights/process', { method: 'POST' });
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

  const sentLabels   = (summary?.sentimentDistribution ?? []).map((s) => s.label ?? s._id ?? s.range ?? '');
  const sentCounts   = (summary?.sentimentDistribution ?? []).map((s) => s.count ?? 0);
  const SENT_COLORS  = ['#EF4444', '#F59E0B', '#22C55E', '#3B82F6'];

  const outLabels    = (summary?.outcomes ?? []).map((o) => o.label ?? o._id ?? o.outcome ?? '');
  const outCounts    = (summary?.outcomes ?? []).map((o) => o.count ?? 0);
  const OUT_COLORS   = ['#22C55E', '#EF4444', '#F59E0B', '#8B5CF6', '#3B82F6'];

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
            Process Transcripts
          </Button>
          {processStatus && (
            <span className="text-xs text-text-muted">{processStatus}</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-5 py-3 text-sm text-danger">{error}</div>
      )}

      {/* ── 2. KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Analysed Calls"
          value={summary?.total_analysed ?? '—'}
          sub="Total calls processed"
          accent="purple"
        />
        <KpiCard
          label="Avg Customer Sentiment"
          value={summary?.avg_customer_sentiment != null ? `${(Number(summary.avg_customer_sentiment) * 100).toFixed(0)}%` : '—'}
          sub="Customer sentiment score"
          accent={sentimentAccent(Number(summary?.avg_customer_sentiment ?? 0) * 100)}
        />
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
                  {['Call Ref', 'Agent', 'Date', 'Category', 'Flags', 'Sentiment', 'Details'].map((h) => (
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
                          {sig.call_date ? new Date(sig.call_date).toLocaleDateString() : '—'}
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
                      </tr>
                      {isExpanded && (
                        <tr key={`expanded-${id}`} className="bg-surface/50">
                          <td colSpan={7} className="px-5 py-4 border-b border-border">
                            <ExpandedCall callId={id} />
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
            <ol className="space-y-2">
              {complaints.map((c, i) => (
                <li key={i} className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
                  <span className="text-xs font-bold text-text-muted w-5 text-right">{i + 1}.</span>
                  <span className="flex-1 text-sm text-text-main truncate">{c.complaint ?? c.text ?? c._id ?? (typeof c === 'string' ? c : 'Unknown')}</span>
                  {(c.count ?? c.frequency) != null && (
                    <Badge variant="info">{c.count ?? c.frequency}</Badge>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardPanel>

        <CardPanel title="Key Moment Types">
          {moments.length === 0 ? (
            <EmptyState message="No key moment data." />
          ) : (
            <ul className="space-y-2">
              {moments.map((m, i) => {
                const count = Number(m.frequency ?? m.count ?? 1);
                const total = moments.reduce((a, x) => a + Number(x.frequency ?? x.count ?? 1), 0);
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <li key={i} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-main font-medium">{m.moment_type ?? m.type ?? m.label ?? m._id ?? (typeof m === 'string' ? m : 'Unknown')}</span>
                      <span className="text-text-muted">{count ?? '—'}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%`, transition: 'width 0.6s' }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
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
                    ? Number(a.avg_customer_sentiment) * 100 + 50  // normalize -1..1 -> 0..100
                    : 50
                )}
              />
            ))}
          </div>
        )}
      </CardPanel>

      {/* ── 9. Location + Product Charts ── */}
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
