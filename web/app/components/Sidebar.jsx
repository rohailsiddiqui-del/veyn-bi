'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { cn } from '@/app/lib/utils';
import {
  LayoutDashboard, Users, Target, TrendingUp, Brain, MessageSquare,
  Upload, Bell, LogOut, Moon, Sun, Download, ChevronDown, ShieldCheck, GitBranch, ClipboardList, Radar,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview',    icon: LayoutDashboard },
  { id: 'agents',   label: 'Agents',      icon: Users },
  { id: 'params',   label: 'Parameters',  icon: Target },
  { id: 'trend',    label: 'Trends',      icon: TrendingUp },
  { id: 'insights', label: 'Insights',    icon: Brain },
  { id: 'chat',     label: 'AI Chat',     icon: MessageSquare },
  { id: 'upload',   label: 'Upload',      icon: Upload },
  { id: 'settings', label: 'Settings',    icon: Bell },
];

function NavButton({ id, label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={cn(
        'nav-item w-full text-left mb-0.5 relative group',
        active && 'active'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
      )}
      <Icon
        size={15}
        className={cn(
          'flex-shrink-0 ml-0.5 transition-colors',
          active ? 'text-primary-soft' : 'text-text-muted group-hover:text-text-main'
        )}
      />
      <span className="flex-1">{label}</span>
    </button>
  );
}

export default function Sidebar({ activePage, onNavigate }) {
  const { user, logout, theme, setTheme, apiFetch } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    function close(e) {
      if (!e.target.closest('#export-dropdown')) setExportOpen(false);
    }
    if (exportOpen) document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [exportOpen]);

  async function exportCSV(type) {
    setExportOpen(false);
    try {
      if (type === 'flagged') {
        const signals = await apiFetch('/api/insights/signals');
        const headers = ['Call Ref','Agent','Date','Category','Flags','Sentiment','Outcome','Summary'];
        const rows = [headers, ...signals.map(r => [
          r.call_ref || r.call_id, r.agent_name,
          r.call_date ? new Date(r.call_date).toLocaleDateString('en-GB') : '',
          r.call_category,
          [r.threat_detected?'Threat':'',r.social_media_mention?'Social':'',r.escalation_request?'Escalation':'',r.regulatory_mention?'Regulatory':''].filter(Boolean).join('; '),
          r.customer_sentiment_overall, r.call_outcome, r.summary,
        ])];
        downloadCSVHelper(rows, 'flagged-calls-' + new Date().toISOString().slice(0,10) + '.csv');
      } else if (type === 'agents') {
        const agents = await apiFetch('/api/analytics/agents');
        const headers = ['Rank','Agent','Total Calls','Avg Score','Error Free','Deficient','Avg Duration (min)'];
        const rows = [headers, ...agents.map((a,i) => [i+1, a.agent_name, a.total_calls, parseFloat(a.avg_score).toFixed(1), a.error_free, a.deficient, a.avg_duration_min])];
        downloadCSVHelper(rows, 'agent-performance-' + new Date().toISOString().slice(0,10) + '.csv');
      } else if (type === 'params') {
        const params = await apiFetch('/api/analytics/params');
        const headers = ['Parameter','Failure Rate (%)','Calls Scored 0'];
        const rows = [headers, ...params.map(p => [p.param_name, parseFloat(p.zero_pct).toFixed(1), p.zero_count])];
        downloadCSVHelper(rows, 'parameter-analysis-' + new Date().toISOString().slice(0,10) + '.csv');
      }
    } catch(e) { alert('Export failed: ' + e.message); }
  }

  function downloadCSVHelper(rows, filename) {
    const csv = rows.map(r => r.map(v => {
      if (v == null) return '';
      const s = String(v).replace(/"/g,'""');
      return /[",\n]/.test(s) ? '"'+s+'"' : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    URL.revokeObjectURL(a.href);
  }

  const isCaseMode = user?.dashboard_mode === 'case';
  const isGroupMode = user?.dashboard_mode === 'group';
  const isHBL = user?.tenantSlug === 'hbl' || user?.tenantName === 'Habib Bank Limited';
  const isDominos = user?.tenantSlug === 'dominos';
  const orgInitial = (user?.tenantName || 'V').charAt(0).toUpperCase();

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[220px] bg-surface border-r border-border flex flex-col z-40"
      style={{ backgroundImage: 'linear-gradient(to bottom, rgba(139,92,246,0.05) 0%, transparent 100px)' }}
    >
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary via-primary-soft to-transparent" />

      {/* Logo / Org */}
      <div className="px-4 py-4 border-b border-border flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary-soft flex items-center justify-center text-white text-xs font-bold shrink-0">
          {orgInitial}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold text-text-main leading-tight truncate">
            {user?.tenantName || 'Veyn.ai'}
          </div>
          <div className="text-[9px] text-text-muted uppercase tracking-widest leading-tight mt-0.5">
            CX Intelligence
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2.5 overflow-y-auto">
        {isCaseMode ? (
          <>
            <NavButton id="cases"    label="Case Trajectory" icon={GitBranch}     active={activePage === 'cases'}    onClick={onNavigate} />
            <NavButton id="insights" label="Insights"        icon={Brain}         active={activePage === 'insights'} onClick={onNavigate} />
            <NavButton id="chat"     label="AI Chat"         icon={MessageSquare} active={activePage === 'chat'}     onClick={onNavigate} />
          </>
        ) : isGroupMode ? (
          <>
            <div className="mb-1.5 px-2 pt-1 text-[9px] font-semibold text-text-muted uppercase tracking-widest">
              Analytics
            </div>
            <NavButton id="overview"  label="Overview"       icon={LayoutDashboard} active={activePage === 'overview'}  onClick={onNavigate} />
            <NavButton id="agents"    label="Agents"         icon={Users}           active={activePage === 'agents'}    onClick={onNavigate} />
            <NavButton id="params"    label="Scorecards"     icon={Target}          active={activePage === 'params'}    onClick={onNavigate} />
            <NavButton id="trend"     label="Trends"         icon={TrendingUp}      active={activePage === 'trend'}     onClick={onNavigate} />
            <NavButton id="insights"  label="Insights"       icon={Brain}           active={activePage === 'insights'}  onClick={onNavigate} />
            {isDominos && (
              <NavButton id="signal-drilldown" label="Signal Drilldown" icon={Radar} active={activePage === 'signal-drilldown'} onClick={onNavigate} />
            )}
            {isHBL && (
              <NavButton id="quality" label="Quality Report" icon={ClipboardList} active={activePage === 'quality'} onClick={onNavigate} />
            )}
            <div className="my-2 border-t border-border" />
            <div className="mb-1.5 px-2 pt-1 text-[9px] font-semibold text-text-muted uppercase tracking-widest">
              Manage
            </div>
            <NavButton id="upload"    label="Upload"         icon={Upload}          active={activePage === 'upload'}    onClick={onNavigate} />
            <NavButton id="settings"  label="Settings"       icon={Bell}            active={activePage === 'settings'}  onClick={onNavigate} />
          </>
        ) : (
          <>
            <div className="mb-1.5 px-2 pt-1 text-[9px] font-semibold text-text-muted uppercase tracking-widest">
              Analytics
            </div>
            {NAV_ITEMS.slice(0, 5).map(({ id, label, icon }) => (
              <NavButton key={id} id={id} label={label} icon={icon} active={activePage === id} onClick={onNavigate} />
            ))}
            {isHBL && (
              <NavButton id="quality" label="Quality Report" icon={ClipboardList} active={activePage === 'quality'} onClick={onNavigate} />
            )}
            <div className="my-2 border-t border-border" />
            <div className="mb-1.5 px-2 pt-1 text-[9px] font-semibold text-text-muted uppercase tracking-widest">
              Manage
            </div>
            {NAV_ITEMS.slice(5).map(({ id, label, icon }) => (
              <NavButton key={id} id={id} label={label} icon={icon} active={activePage === id} onClick={onNavigate} />
            ))}
          </>
        )}

        {/* Superadmin */}
        {user?.role === 'superadmin' && (
          <>
            <div className="my-2 border-t border-border" />
            <NavButton id="admin" label="Admin" icon={ShieldCheck} active={activePage === 'admin'} onClick={onNavigate} />
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-border space-y-2.5">
        {/* User info */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary-soft text-[10px] font-bold shrink-0">
            {orgInitial}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-text-main truncate">{user?.tenantName || '—'}</div>
            <div className="text-[9px] text-text-muted capitalize">{user?.role} · {user?.industry || 'generic'}</div>
          </div>
        </div>

        {/* Export dropdown */}
        <div id="export-dropdown" className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setExportOpen(!exportOpen); }}
            className="btn-outline w-full flex items-center justify-between text-[11px] py-1.5"
          >
            <span className="flex items-center gap-1.5">
              <Download size={11} />
              Export Data
            </span>
            <ChevronDown size={11} className={cn('transition-transform duration-200', exportOpen && 'rotate-180')} />
          </button>
          {exportOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-full bg-surface border border-border2 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-widest font-semibold border-b border-border">
                Download
              </div>
              {[
                ['flagged',  '📋 Flagged Calls CSV'],
                ['agents',   '👥 Agent Performance CSV'],
                ['params',   '🎯 Parameter Analysis CSV'],
              ].map(([t, l]) => (
                <button key={t} onClick={() => exportCSV(t)}
                  className="w-full text-left px-3 py-2.5 text-xs text-text-label hover:bg-surface2 hover:text-text-main transition-colors border-b border-border last:border-0">
                  {l}
                </button>
              ))}
              <button onClick={() => { setExportOpen(false); window.print(); }}
                className="w-full text-left px-3 py-2.5 text-xs text-text-label hover:bg-surface2 hover:text-text-main transition-colors">
                🖨 Print / PDF
              </button>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <div className="flex gap-1">
          <button onClick={() => setTheme('dark')}
            className={cn('flex-1 py-1 text-[10px] rounded-md border transition-all', theme === 'dark' ? 'border-primary text-primary-soft bg-primary/10' : 'border-border2 text-text-muted bg-surface2')}>
            <Moon size={9} className="inline mr-1" />Dark
          </button>
          <button onClick={() => setTheme('light')}
            className={cn('flex-1 py-1 text-[10px] rounded-md border transition-all', theme === 'light' ? 'border-primary text-primary-soft bg-primary/10' : 'border-border2 text-text-muted bg-surface2')}>
            <Sun size={9} className="inline mr-1" />Light
          </button>
        </div>

        <button onClick={logout} className="flex items-center gap-1.5 text-[11px] text-text-muted hover:text-danger transition-colors w-full px-1 py-0.5">
          <LogOut size={11} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
