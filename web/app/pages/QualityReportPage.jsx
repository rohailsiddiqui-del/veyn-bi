'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

const ApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

// ── Data ─────────────────────────────────────────────────────────────────────

const PARAM_GROUPS = [
  {
    id: 'cx', name: 'Customer Experience', adherence: 100, status: 'clean',
    desc: 'Opening greeting, active listening, tone & professionalism, hold procedure, call closing.',
    params: [
      { name: 'Opening Greeting', pct: 100 },
      { name: 'Active Listening', pct: 100 },
      { name: 'Tone & Professionalism', pct: 100 },
      { name: 'Hold Procedure', pct: 100 },
      { name: 'Call Closing', pct: 100 },
    ],
    risks: [],
  },
  {
    id: 'ops', name: 'Operational Efficiency', adherence: 90, status: 'coach',
    desc: 'Dead-air discipline, avoidance of unnecessary call prolonging, handle time vs SLA.',
    params: [
      { name: 'Pause / Dead-Air Discipline', pct: 80 },
      { name: 'Avoidance of Unnecessary Prolonging', pct: 100 },
    ],
    risks: [{
      service: 'Debit Card Activation', level: 'risk',
      finding: 'Long, unexplained pause during card-detail verification',
      lines: [
        { who: 'Customer', text: 'Yes, I\'ll tell you, wait.' },
        { who: 'Customer', text: 'Wait a minute. (~12 second gap)' },
        { who: 'Agent', text: 'Yes, yes.' },
      ],
      why: 'Customer left waiting mid-verification with no acknowledgment. A short "take your time, I\'ll wait" keeps the customer reassured.',
    }],
  },
  {
    id: 'comms', name: 'Communication & Follow-Through', adherence: 60, status: 'coach',
    desc: 'Agent restates the action taken, system time/date, and name before closing.',
    params: [{ name: 'Instructions / Action Restated at Closing', pct: 60 }],
    risks: [
      {
        service: 'Fraud Reporting', level: 'risk',
        finding: 'Call closes without a clear restatement of the logged outcome',
        lines: [
          { who: 'Customer', text: 'Meaning, this amount will be reversed to me, right?' },
          { who: 'Agent', text: 'Ma\'am, we cannot commit to that — we have forwarded your case to the department.' },
          { who: 'Agent', text: 'Okay thank you, now your call will be transferred to the IVR…' },
        ],
        why: 'Case logged correctly but call ends without stating system time, date, or a clear summary of what was actioned.',
      },
      {
        service: 'Debit Card Replacement', level: 'risk',
        finding: 'Call closes without restating the request or next steps',
        lines: [
          { who: 'Agent', text: 'Anything else?' },
          { who: 'Customer', text: 'No, thank you.' },
          { who: 'Agent', text: 'Okay, thank you for calling, take care, goodbye.' },
        ],
        why: 'Replacement logged and charges discussed, but agent never confirms ticket number, system time, or date before ending.',
      },
    ],
  },
  {
    id: 'info', name: 'Information Accuracy', adherence: 100, status: 'watch',
    statusNote: 'Wording flagged',
    desc: 'Product, process, charges, and turnaround disclosure.',
    params: [{ name: 'Info Disclosure Accuracy', pct: 100 }],
    risks: [{
      service: 'Debit Card Replacement', level: 'watch',
      finding: 'Charges and turnaround quoted narrower than stated policy',
      lines: [
        { who: 'Agent', text: 'A fee of 600 will be charged for the replacement.' },
        { who: 'Agent', text: 'You will receive the card at your mailing address in seven to ten working days.' },
      ],
      why: 'Policy specifies an additional charge component and a narrower turnaround window. A customer expecting "ten days" creates avoidable friction.',
    }],
  },
  {
    id: 'verify', name: 'Verification & Authentication', adherence: 100, status: 'watch',
    statusNote: 'Script drift flagged',
    desc: 'Customer verification, registered number compliance, OTP compliance.',
    params: [
      { name: 'Customer Verification', pct: 100 },
      { name: 'Registered Number Compliance', pct: 100 },
      { name: 'OTP Compliance', pct: 100 },
    ],
    risks: [
      {
        service: 'Debit Card Replacement', level: 'watch',
        finding: 'Verification question asked for the wrong relationship field',
        lines: [{ who: 'Agent', text: 'Tell me your father\'s name.' }],
        why: 'Policy calls for the mother\'s name at this step. Worth a script check.',
      },
      {
        service: 'Debit Card Activation', level: 'watch',
        finding: "Stated date of birth didn't match the confirmation given back",
        lines: [
          { who: 'Customer', text: '21st October 1988.' },
          { who: 'Agent', text: '21st October 1987, okay, thank you very much.' },
        ],
        why: "Agent's restated year doesn't match what the customer said, with no audible correction loop.",
      },
    ],
  },
  {
    id: 'syslog', name: 'System Usage & Logging', adherence: 100, status: 'clean',
    desc: 'Wrap-up code accuracy, memo line, PIN validation, SR and complaint logging.',
    params: [
      { name: 'Wrap-up Code Accuracy', pct: 100 },
      { name: 'Memo Line Accuracy', pct: 100 },
      { name: 'Memo Line Reviewed', pct: 100 },
      { name: 'PIN Validation / Generation Offer', pct: 100 },
      { name: 'SR / Complaint System Handling', pct: 100 },
    ],
    risks: [],
  },
  {
    id: 'compliance', name: 'Compliance & Risk', adherence: 100, status: 'watch',
    statusNote: 'Consent wording flagged',
    desc: 'Data confidentiality, channel blocking, process/SOP, misguidance, misbehavior.',
    params: [
      { name: 'Data Confidentiality Compliance', pct: 100 },
      { name: 'Channel Blocking Compliance', pct: 100 },
      { name: 'Process / SOP Compliance', pct: 100 },
      { name: 'Misguided / Misbehavior / Call Drop', pct: 100 },
    ],
    risks: [
      {
        service: 'Mobile App Servicing', level: 'watch',
        finding: 'Security action taken on implied rather than explicit consent',
        lines: [{ who: 'Agent', text: 'With your consent, we will deactivate your mobile application… I have deactivated your application.' }],
        why: 'Deactivation proceeds in the same breath as the consent statement, without an audible "yes" from the customer first.',
      },
      {
        service: 'Fraud Reporting', level: 'watch',
        finding: 'Indemnity explained as a warning rather than a clean consent question',
        lines: [
          { who: 'Agent', text: 'If you want to block the channels, tell me — otherwise the bank representative will not be liable.' },
          { who: 'Customer', text: 'Okay, block my channels.' },
        ],
        why: 'Consent given, but phrasing frames it as a liability disclaimer rather than a straightforward question.',
      },
    ],
  },
  {
    id: 'resolution', name: 'Contact Resolution', adherence: 100, status: 'clean',
    desc: 'Probing and issue identification, first call resolution, call transfer compliance.',
    params: [
      { name: 'Probing, Issue Identification & FCR', pct: 100 },
      { name: 'First Call Resolution', pct: 100 },
      { name: 'Call Transfer Compliance', pct: 100 },
    ],
    risks: [],
  },
];

const SERVICE_LINES = [
  { name: 'Debit Card Replacement', score: 96, aht: 'Within target', weakest: 'Action/time restatement', status: 'coach' },
  { name: 'Fraud Reporting',        score: 96, aht: 'Within target', weakest: 'Action/time restatement', status: 'coach' },
  { name: 'Debit Card Activation',  score: 97, aht: 'Within target', weakest: 'Pause / dead-air',        status: 'watch' },
  { name: 'Credit Card Payment',    score: 100, aht: 'Within target', weakest: '—',                      status: 'clean' },
  { name: 'Mobile App Servicing',   score: 100, aht: 'Within target', weakest: '—',                      status: 'clean' },
];

const PRIORITIES = [
  { icon: '🗣️', text: 'Coach agents to close every call with an explicit action + time/date restatement.', group: 'Communication & Follow-Through' },
  { icon: '🔇', text: 'Reduce unexplained dead air during verification-heavy calls.', group: 'Operational Efficiency' },
  { icon: '📋', text: 'Tighten charges/turnaround wording and verification script phrasing.', group: 'Information Accuracy' },
  { icon: '✅', text: 'Add an explicit consent checkpoint before irreversible security actions.', group: 'Compliance & Risk' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  clean: { pill: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', dot: 'bg-emerald-400', bar: '#34d399' },
  watch: { pill: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',   dot: 'bg-amber-400',   bar: '#fbbf24' },
  coach: { pill: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',   dot: 'bg-amber-400',   bar: '#f59e0b' },
  risk:  { pill: 'bg-red-500/15 text-red-400 border border-red-500/30',          dot: 'bg-red-400',     bar: '#f87171' },
};

function StatusPill({ status, note }) {
  return (
    <span className={`inline-block text-[10px] font-mono uppercase tracking-wide px-2 py-0.5 rounded ${STATUS_STYLES[status]?.pill}`}>
      {note || status}
    </span>
  );
}

function ScoreRing({ score, size = 80 }) {
  const color = score === 100 ? '#34d399' : score >= 97 ? '#fbbf24' : '#f87171';
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="6"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fill={color} fontSize={size * 0.22} fontWeight="700" fontFamily="monospace">
        {score}
      </text>
    </svg>
  );
}

function EvidenceCard({ risk }) {
  const borderColor = risk.level === 'risk' ? 'border-l-red-500' : 'border-l-amber-400';
  return (
    <div className={`border border-border border-l-4 ${borderColor} bg-surface rounded-xl p-4 mb-3 last:mb-0`}>
      <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">{risk.service}</div>
      <div className="text-sm font-semibold text-text-main mb-3">{risk.finding}</div>
      <div className="bg-surface2 rounded-lg p-3 mb-3 space-y-1.5">
        {risk.lines.map((l, i) => (
          <div key={i} className="text-xs font-mono">
            <span className={`font-bold ${l.who === 'Agent' ? 'text-violet-400' : 'text-text-muted'}`}>{l.who} — </span>
            <span className="text-text-label">{l.text}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-muted leading-relaxed">{risk.why}</p>
    </div>
  );
}

function GroupCard({ group }) {
  const [open, setOpen] = useState(false);
  const s = STATUS_STYLES[group.status];
  const hasRisks = group.risks.length > 0;

  return (
    <div className={`card mb-3 transition-all ${open ? 'ring-1 ring-border2' : ''}`}>
      <div className="flex items-center gap-4 cursor-pointer" onClick={() => setOpen(o => !o)}>
        {/* Status dot */}
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} />

        {/* Name + desc */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text-main">{group.name}</span>
            <StatusPill status={group.status} note={group.statusNote} />
            {hasRisks && (
              <span className="text-[10px] text-amber-400 font-mono">
                {group.risks.length} finding{group.risks.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 truncate">{group.desc}</p>
        </div>

        {/* Score bar mini */}
        <div className="shrink-0 w-32 hidden md:block">
          <div className="flex justify-between text-[10px] text-text-muted mb-1">
            <span>Adherence</span><span className="font-mono">{group.adherence}%</span>
          </div>
          <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${group.adherence}%`, background: s.bar }} />
          </div>
        </div>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-border space-y-4">
          {/* Param bars */}
          <div>
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Parameter breakdown</div>
            <div className="space-y-2">
              {group.params.map(p => {
                const c = p.pct === 100 ? 'bg-emerald-500' : p.pct >= 80 ? 'bg-amber-400' : 'bg-red-500';
                return (
                  <div key={p.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-label">{p.name}</span>
                      <span className="font-mono text-text-muted">{p.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${c}`} style={{ width: `${p.pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evidence */}
          {hasRisks ? (
            <div>
              <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest mb-3">Risk evidence</div>
              {group.risks.map((r, i) => <EvidenceCard key={i} risk={r} />)}
            </div>
          ) : (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3">
              ✓ No risk items identified — all service lines scored full marks across this group.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function QualityReportPage() {
  const radarSeries = [{
    name: 'Adherence %',
    data: PARAM_GROUPS.map(g => g.adherence),
  }];

  const radarOptions = {
    chart: { type: 'radar', toolbar: { show: false }, background: 'transparent' },
    xaxis: { categories: PARAM_GROUPS.map(g => g.name.split(' & ').join('\n& ')) },
    yaxis: { show: false, min: 0, max: 100 },
    fill: { opacity: 0.25, colors: ['#8b5cf6'] },
    stroke: { show: true, width: 2, colors: ['#8b5cf6'] },
    markers: { size: 4, colors: ['#8b5cf6'], strokeWidth: 0 },
    plotOptions: { radar: { polygons: { strokeColors: 'rgba(255,255,255,0.08)', fill: { colors: ['transparent'] } } } },
    tooltip: { y: { formatter: v => v + '%' } },
    theme: { mode: 'dark' },
    colors: ['#8b5cf6'],
  };

  const barSeries = [{ name: 'Score', data: SERVICE_LINES.map(s => s.score) }];
  const barOptions = {
    chart: { type: 'bar', toolbar: { show: false }, background: 'transparent' },
    plotOptions: { bar: { borderRadius: 5, horizontal: false, columnWidth: '50%' } },
    dataLabels: { enabled: true, style: { fontSize: '11px', fontFamily: 'monospace' } },
    xaxis: {
      categories: SERVICE_LINES.map(s => s.name.split(' ').slice(0, 2).join(' ')),
      labels: { style: { colors: '#9ca3af', fontSize: '11px' } },
    },
    yaxis: { min: 90, max: 100, labels: { style: { colors: '#9ca3af' }, formatter: v => v + '%' } },
    colors: SERVICE_LINES.map(s => s.status === 'clean' ? '#34d399' : s.status === 'watch' ? '#fbbf24' : '#f59e0b'),
    grid: { borderColor: 'rgba(255,255,255,0.06)' },
    theme: { mode: 'dark' },
    tooltip: { y: { formatter: v => v + ' / 100' } },
  };

  return (
    <div className="space-y-6 max-w-5xl pb-10">

      {/* Header */}
      <div>
        <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1">Contact Center · May 2026 · Pilot Evaluation</div>
        <h1 className="text-2xl font-bold text-text-main mb-1">Quality & Compliance Report</h1>
        <p className="text-sm text-text-muted max-w-2xl">
          Single view of call performance against SOP across every parameter group — where customers are protected well, where language is drifting from policy, and where a short coaching push moves the needle.
        </p>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { num: '97.8', label: 'Avg Quality Score', sub: 'out of 100', color: 'text-violet-400' },
          { num: '0%',   label: 'Fatal-Error Rate',   sub: 'across 5 calls', color: 'text-emerald-400' },
          { num: '60%',  label: 'Full Restatement',   sub: 'action + time/date', color: 'text-amber-400' },
          { num: '80%',  label: 'No Dead Air',         sub: 'unexplained pauses', color: 'text-amber-400' },
        ].map(({ num, label, sub, color }) => (
          <div key={label} className="card text-center py-4">
            <div className={`text-3xl font-bold font-mono mb-1 ${color}`}>{num}</div>
            <div className="text-xs font-semibold text-text-main leading-tight">{label}</div>
            <div className="text-[10px] text-text-muted mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Radar */}
        <div className="card">
          <div className="text-xs font-semibold text-text-main mb-1">Parameter Group Coverage</div>
          <div className="text-[11px] text-text-muted mb-3">Adherence % across all 8 groups</div>
          <ApexChart type="radar" series={radarSeries} options={radarOptions} height={300} />
        </div>

        {/* Bar */}
        <div className="card">
          <div className="text-xs font-semibold text-text-main mb-1">Score by Service Line</div>
          <div className="text-[11px] text-text-muted mb-3">Green = stable · Amber = needs coaching</div>
          <ApexChart type="bar" series={barSeries} options={barOptions} height={300} />
        </div>
      </div>

      {/* Service line table with score rings */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="text-sm font-semibold text-text-main">Service Line Breakdown</div>
        </div>
        <div className="divide-y divide-border">
          {SERVICE_LINES.map(sl => (
            <div key={sl.name} className="flex items-center gap-4 px-5 py-4 hover:bg-surface2/50 transition-colors">
              <ScoreRing score={sl.score} size={64} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-main">{sl.name}</div>
                <div className="text-xs text-text-muted mt-0.5">AHT: {sl.aht}</div>
                {sl.weakest !== '—' && (
                  <div className="text-xs text-amber-400 mt-1">⚠ Weakest: {sl.weakest}</div>
                )}
              </div>
              <StatusPill status={sl.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Top priorities */}
      <div className="card border border-amber-500/25 bg-amber-500/5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1.5 h-5 bg-amber-400 rounded-full" />
          <div className="text-sm font-bold text-text-main">Top Coaching Priorities This Cycle</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PRIORITIES.map((p, i) => (
            <div key={i} className="flex gap-3 bg-surface2 rounded-xl p-3">
              <span className="text-xl shrink-0">{p.icon}</span>
              <div>
                <div className="text-[10px] font-mono text-amber-400 mb-1">{p.group}</div>
                <div className="text-xs text-text-label leading-relaxed">{p.text}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Parameter groups */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-text-main">Parameter Group Health</div>
          <div className="flex items-center gap-3 text-[11px] text-text-muted">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Clean</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Coach / Watch</span>
          </div>
        </div>
        <p className="text-xs text-text-muted mb-4">Click any group to expand parameter breakdown and evidence.</p>
        {PARAM_GROUPS.map(g => <GroupCard key={g.id} group={g} />)}
      </div>

      <div className="text-[11px] text-text-muted border-t border-border pt-4">
        Insight report generated from AI evaluation of contact center interactions, scored against the organization's own quality and compliance parameters. Evidence quotes drawn directly from underlying call interactions.
      </div>
    </div>
  );
}
