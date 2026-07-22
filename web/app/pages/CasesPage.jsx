'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { Spinner } from '@/app/components/ui';
import {
  FolderOpen, Users, TrendingUp, CheckCircle,
  Phone, MessageSquare, ChevronRight, ArrowLeft, Search,
  BarChart2, X, ChevronUp, ChevronDown, ChevronsUpDown
} from 'lucide-react';

const SCORE_BG = {
  pass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  fail: 'bg-red-500/20 text-red-300 border-red-500/30',
  na:   'bg-slate-700/40 text-slate-500 border-slate-600/30',
};
const CHANNEL_ICON = { Voice: Phone, WhatsApp: MessageSquare };

// Strip leading [YYYY-MM-DD HH:MM:SS] timestamps from each transcript line.
function stripTimestamps(text) {
  if (!text) return text;
  return text.replace(/^\s*\[[^\]]*\]\s*/gm, '');
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-primary-soft' }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
        {Icon && <Icon size={16} className={color} />}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-text-muted mt-1">{sub}</div>}
    </div>
  );
}

function ScoreBadge({ score }) {
  const cls = SCORE_BG[score] || SCORE_BG.na;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase ${cls}`}>
      {score}
    </span>
  );
}

function PassRateBar({ rate }) {
  if (rate == null) return <span className="text-xs text-slate-500">—</span>;
  const color = rate >= 80 ? 'bg-emerald-500' : rate >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <span className="text-xs text-text-muted w-8 text-right">{rate}%</span>
    </div>
  );
}

// ── Case Detail (trajectory view) ────────────────────────────────────────────
function CaseDetail({ caseNumber, onBack }) {
  const { apiFetch } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedInteraction, setExpandedInteraction] = useState(null);

  useEffect(() => {
    apiFetch(`/api/cases/${caseNumber}`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [caseNumber]);

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!data) return <div className="text-red-400 p-4">Failed to load case</div>;

  const { case: c, interactions } = data;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-main transition-colors">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="h-4 w-px bg-border" />
        <h2 className="text-lg font-bold text-text-main">Case #{c.case_number}</h2>
        <span className="text-xs bg-primary/20 text-primary-soft border border-primary/30 px-2 py-0.5 rounded-full">
          {c.total_interactions} interaction{c.total_interactions !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-6 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-4">
          {interactions.map((interaction, idx) => {
            const Icon = CHANNEL_ICON[interaction.channel] || MessageSquare;
            const isExpanded = expandedInteraction === interaction.id;
            const passRate = interaction.passRate;
            const rateColor = passRate >= 80 ? 'text-emerald-400' : passRate >= 60 ? 'text-yellow-400' : 'text-red-400';
            const dotBorder = passRate >= 80 ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
              : passRate >= 60 ? 'border-yellow-500 bg-yellow-500/20 text-yellow-400'
              : 'border-red-500 bg-red-500/20 text-red-400';

            return (
              <div key={interaction.id} className="relative pl-16">
                <div className={`absolute left-3.5 top-3 w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${dotBorder}`}>
                  {idx + 1}
                </div>
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                  <button
                    className="w-full text-left p-4 hover:bg-surface2 transition-colors"
                    onClick={() => setExpandedInteraction(isExpanded ? null : interaction.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <Icon size={13} />
                          <span>{interaction.channel}</span>
                        </div>
                        <div className="font-medium text-text-main text-sm">{interaction.agent_name}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        {passRate != null && (
                          <div className="text-right">
                            <span className={`text-lg font-bold ${rateColor}`}>{passRate}%</span>
                            <span className="text-xs text-text-muted ml-1">pass rate</span>
                          </div>
                        )}
                        <ChevronRight size={14} className={`text-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {Object.entries(interaction.scoresByCategory || {}).map(([cat, counts]) => {
                        const applicable = counts.pass + counts.fail;
                        const pct = applicable > 0 ? Math.round((counts.pass / applicable) * 100) : null;
                        const shortName = cat
                          .replace('Customer Experience', 'CX')
                          .replace('Product Knowledge & Resolution', 'Product KR')
                          .replace('Process Compliance', 'Process');
                        const barColor = pct == null ? '' : pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
                        return (
                          <div key={cat}>
                            <div className="flex justify-between text-[10px] text-text-muted mb-1">
                              <span>{shortName}</span>
                              <span>{pct != null ? pct + '%' : 'N/A'}</span>
                            </div>
                            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                              {pct != null && <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border px-4 pb-4">
                      {['Case Flow', 'Customer Experience', 'Product Knowledge & Resolution', 'Process Compliance'].map(cat => {
                        const catScores = (interaction.scores || []).filter(s => s.category === cat);
                        if (!catScores.length) return null;
                        return (
                          <div key={cat} className="mt-4">
                            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">{cat}</div>
                            <div className="space-y-1.5">
                              {catScores.map(s => (
                                <div key={s.subparameter} className="flex items-center justify-between gap-3">
                                  <span className="text-xs text-text-label flex-1 leading-tight">{s.subparameter}</span>
                                  <ScoreBadge score={s.score} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {interaction.translation && (
                        <div className="mt-4 border-t border-border pt-4">
                          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Transcript (EN)</div>
                          <p className="text-xs text-text-label leading-relaxed bg-surface2 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">
                            {stripTimestamps(interaction.translation)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Cases Overview ────────────────────────────────────────────────────────────
export default function CasesPage() {
  const { apiFetch } = useAuth();
  const [overview, setOverview] = useState(null);
  const [allCases, setAllCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedCase, setSelectedCase] = useState(null);
  const [activeTab, setActiveTab] = useState('cases');
  const [agentData, setAgentData] = useState(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [sort, setSort] = useState({ key: 'total_interactions', dir: 'desc' });
  const limit = 15;

  const loadOverview = useCallback(async () => {
    const data = await apiFetch('/api/cases');
    setOverview(data);
  }, [apiFetch]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const data = await apiFetch('/api/cases/list?page=1&limit=1000');
    setAllCases(data.cases || []);
    setLoading(false);
  }, [apiFetch]);

  const loadAgents = useCallback(async () => {
    if (agentData) return;
    setAgentsLoading(true);
    const data = await apiFetch('/api/cases/agents/performance');
    setAgentData(data.agents || []);
    setAgentsLoading(false);
  }, [agentData, apiFetch]);

  useEffect(() => { loadOverview(); loadAll(); }, [loadOverview, loadAll]);
  useEffect(() => { if (activeTab === 'agents') loadAgents(); }, [activeTab, loadAgents]);
  useEffect(() => { setPage(1); }, [search, sort]);

  const sortVal = (c, key) => {
    switch (key) {
      case 'case_number': { const n = Number(c.case_number); return isNaN(n) ? c.case_number : n; }
      case 'total_interactions': return Number(c.total_interactions) || 0;
      case 'channels': return (c.channels || []).length;
      case 'agents': return (c.agents || []).length;
      case 'pass_rate': return c.pass_rate == null ? -1 : parseFloat(c.pass_rate);
      default: return 0;
    }
  };

  const filtered = useMemo(() => {
    let rows = allCases;
    if (search) rows = rows.filter(c => String(c.case_number).toLowerCase().includes(search.toLowerCase()));
    const { key, dir } = sort;
    const mult = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortVal(a, key), vb = sortVal(b, key);
      if (va < vb) return -1 * mult;
      if (va > vb) return 1 * mult;
      return String(a.case_number).localeCompare(String(b.case_number));
    });
  }, [allCases, search, sort]);

  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * limit, page * limit);

  const toggleSort = (key) => setSort(s =>
    s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                  : { key, dir: key === 'case_number' ? 'asc' : 'desc' });

  if (selectedCase) {
    return <CaseDetail caseNumber={selectedCase} onBack={() => setSelectedCase(null)} />;
  }

  const stats = overview?.stats;
  const channels = overview?.channels || [];
  const topFails = overview?.topFailingSubparams || [];

  const SortHeader = ({ label, sortKey, align = 'left' }) => (
    <th className={`px-4 py-3 text-${align}`}>
      <button
        onClick={() => toggleSort(sortKey)}
        className="inline-flex items-center gap-1 uppercase hover:text-text-main transition-colors"
      >
        {label}
        {sort.key === sortKey
          ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ChevronsUpDown size={12} className="opacity-30" />}
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Cases" value={stats.total_cases} icon={FolderOpen} />
          <StatCard label="FCR Rate" value={`${stats.fcr_rate}%`} sub="Resolved in 1 interaction" icon={CheckCircle} color="text-emerald-400" />
          <StatCard label="Avg Interactions" value={stats.avg_interactions_per_case} sub="per case" icon={TrendingUp} />
          <StatCard label="Unique Agents" value={stats.unique_agents} icon={Users} />
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Channel Breakdown</div>
            <div className="space-y-3">
              {channels.map(ch => {
                const tot = channels.reduce((s, c) => s + parseInt(c.count), 0);
                const pct = Math.round((parseInt(ch.count) / tot) * 100);
                const Icon = CHANNEL_ICON[ch.channel] || MessageSquare;
                return (
                  <div key={ch.channel}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5 text-text-label"><Icon size={13} />{ch.channel}</span>
                      <span className="text-text-muted">{ch.count} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-surface2 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Category Pass Rates</div>
            <div className="space-y-3">
              {(overview.categoryScores || []).map(cat => {
                const applicable = parseInt(cat.pass_count) + parseInt(cat.fail_count);
                const rate = applicable > 0 ? Math.round((parseInt(cat.pass_count) / applicable) * 100) : null;
                const shortName = cat.category
                  .replace('Customer Experience', 'CX')
                  .replace('Product Knowledge & Resolution', 'Product KR');
                return (
                  <div key={cat.category}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-text-label">{shortName}</span>
                      <span className="text-text-muted">{rate != null ? rate + '%' : 'N/A'}</span>
                    </div>
                    <PassRateBar rate={rate} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {topFails.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Top Failing Subparameters</div>
          <div className="space-y-2">
            {topFails.slice(0, 5).map((f, i) => (
              <div key={f.subparameter} className="flex items-center gap-3">
                <span className="text-xs text-text-muted w-5">{i + 1}</span>
                <div className="flex-1">
                  <div className="text-xs text-text-label">{f.subparameter}</div>
                  <div className="text-[10px] text-text-muted">{f.category}</div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-red-400">{f.fail_rate}%</span>
                  <span className="text-[10px] text-text-muted ml-1">fail rate</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex gap-1 mb-4 bg-surface border border-border rounded-xl p-1 w-fit">
          {[['cases', 'Case List', FolderOpen], ['agents', 'Agent Performance', BarChart2]].map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${activeTab === id ? 'bg-primary/20 text-primary-soft font-semibold' : 'text-text-muted hover:text-text-main'}`}
            >
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        {activeTab === 'cases' && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border flex items-center gap-3">
              <Search size={14} className="text-text-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { setSearch(searchInput); setPage(1); } }}
                placeholder="Search case number..."
                className="flex-1 bg-transparent text-sm text-text-main placeholder-text-muted outline-none"
              />
              {searchInput && (
                <button onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}>
                  <X size={13} className="text-text-muted hover:text-text-main" />
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-muted">
                      <SortHeader label="Case #" sortKey="case_number" />
                      <SortHeader label="Interactions" sortKey="total_interactions" />
                      <SortHeader label="Channels" sortKey="channels" />
                      <SortHeader label="Agents" sortKey="agents" />
                      <SortHeader label="Pass Rate" sortKey="pass_rate" />
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(c => (
                      <tr
                        key={c.id}
                        className="border-b border-border/50 hover:bg-surface2 cursor-pointer transition-colors"
                        onClick={() => setSelectedCase(c.case_number)}
                      >
                        <td className="px-4 py-3 font-medium text-text-main">#{c.case_number}</td>
                        <td className="px-4 py-3">
                          <span className={`font-bold ${c.total_interactions > 3 ? 'text-red-400' : c.total_interactions > 1 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {c.total_interactions}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {(c.channels || []).map(ch => {
                              const Icon = CHANNEL_ICON[ch] || MessageSquare;
                              return <Icon key={ch} size={13} className="text-text-muted" title={ch} />;
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs max-w-[200px] truncate">
                          {(c.agents || []).slice(0, 2).join(', ')}{(c.agents || []).length > 2 ? ` +${c.agents.length - 2}` : ''}
                        </td>
                        <td className="px-4 py-3 w-32">
                          <PassRateBar rate={c.pass_rate != null ? parseFloat(c.pass_rate) : null} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronRight size={14} className="text-text-muted inline" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between px-4 py-3 border-t border-border text-xs text-text-muted">
                  <span>Showing {total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
                  <div className="flex gap-2">
                    <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:bg-surface2 transition-colors">Prev</button>
                    <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded border border-border disabled:opacity-30 hover:bg-surface2 transition-colors">Next</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {agentsLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted uppercase">
                    <th className="px-4 py-3 text-left">Agent</th>
                    <th className="px-4 py-3 text-left">Cases</th>
                    <th className="px-4 py-3 text-left">Interactions</th>
                    <th className="px-4 py-3 text-left">Channels</th>
                    <th className="px-4 py-3 text-left">Pass Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(agentData || []).map(a => (
                    <tr key={a.agent_name} className="border-b border-border/50 hover:bg-surface2 transition-colors">
                      <td className="px-4 py-3 font-medium text-text-main">{a.agent_name}</td>
                      <td className="px-4 py-3 text-text-muted">{a.cases_handled}</td>
                      <td className="px-4 py-3 text-text-muted">{a.total_interactions}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {(a.channels || []).map(ch => {
                            const Icon = CHANNEL_ICON[ch] || MessageSquare;
                            return <Icon key={ch} size={13} className="text-text-muted" title={ch} />;
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-3 w-36">
                        <PassRateBar rate={a.pass_rate != null ? parseFloat(a.pass_rate) : null} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
