'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { cn } from '@/app/lib/utils';
import { Button } from '@/app/components/ui';
import {
  LayoutDashboard, Users, Target, TrendingUp, Brain, MessageSquare,
  Upload, Bell, LogOut, Moon, Sun, Download, ChevronDown, ShieldCheck, GitBranch,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'agents', label: 'Agents', icon: Users },
  { id: 'params', label: 'Parameters', icon: Target },
  { id: 'trend', label: 'Trends', icon: TrendingUp },
  { id: 'insights', label: 'Insights', icon: Brain },
  { id: 'chat', label: 'AI Chat', icon: MessageSquare },
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'settings', label: 'Settings', icon: Bell },
];

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

  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-surface border-r border-border flex flex-col z-40"
      style={{ backgroundImage: 'linear-gradient(to bottom, rgba(139,92,246,0.06) 0%, transparent 80px)' }}>
      
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-primary via-primary-soft to-transparent" />

      {/* Logo */}
      <div className="px-5 py-5 border-b border-border">
        <div className="text-lg font-bold bg-gradient-to-r from-primary-soft to-primary bg-clip-text text-transparent">
          ⚡ Veyn.ai
        </div>
        <div className="text-[10px] text-text-muted uppercase tracking-widest mt-0.5" id="sidebar-org-name">
          {user?.tenantName || 'CX Intelligence'}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              'nav-item w-full text-left mb-0.5',
              activePage === id && 'active'
            )}
          >
            <Icon size={16} className="flex-shrink-0" />
            <span>{label}</span>
          </button>
        ))}

        {/* Superadmin only */}
        {user?.role === 'superadmin' && (
          <>
            <div className="my-2 border-t border-border" />
            <button
              onClick={() => onNavigate('admin')}
              className={cn('nav-item w-full text-left mb-0.5', activePage === 'admin' && 'active')}
            >
              <ShieldCheck size={16} className="flex-shrink-0" />
              <span>Admin</span>
            </button>
          </>
        )}
      </nav>

      {/* Bottom section */}
      <div className="p-4 border-t border-border space-y-3">
        <div>
          <div className="text-sm font-semibold text-text-main truncate">{user?.tenantName || '—'}</div>
          <div className="text-xs text-text-muted mt-0.5">{user?.role} · {user?.industry || 'generic'}</div>
        </div>

        {/* Export dropdown */}
        <div id="export-dropdown" className="relative">
          <button
            onClick={(e) => { e.stopPropagation(); setExportOpen(!exportOpen); }}
            className="btn-outline w-full flex items-center justify-between text-[11px] py-1.5"
          >
            <span className="flex items-center gap-1.5"><Download size={12} /> Export</span>
            <ChevronDown size={12} className={cn('transition-transform', exportOpen && 'rotate-180')} />
          </button>
          {exportOpen && (
            <div className="absolute bottom-full left-0 mb-1 w-full bg-surface border border-border2 rounded-xl shadow-2xl overflow-hidden z-50">
              <div className="px-3 py-1.5 text-[10px] text-text-muted uppercase tracking-widest font-semibold border-b border-border">Download</div>
              {[['flagged', '📋 Flagged Calls CSV'],['agents','👥 Agent Performance CSV'],['params','🎯 Parameter Analysis CSV']].map(([t,l]) => (
                <button key={t} onClick={() => exportCSV(t)}
                  className="w-full text-left px-3 py-2.5 text-xs text-text-label hover:bg-surface2 hover:text-text-main transition-colors border-b border-border last:border-0">
                  {l}
                </button>
              ))}
              <button onClick={() => { setExportOpen(false); window.print(); }}
                className="w-full text-left px-3 py-2.5 text-xs text-text-label hover:bg-surface2 hover:text-text-main transition-colors border-b border-border">
                🖨 Print / PDF
              </button>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <div className="flex gap-1.5">
          <button onClick={() => setTheme('dark')}
            className={cn('flex-1 py-1 text-[10px] rounded-md border transition-all', theme === 'dark' ? 'border-primary text-primary-soft bg-primary/10' : 'border-border2 text-text-muted bg-surface2')}>
            <Moon size={10} className="inline mr-1" />Dark
          </button>
          <button onClick={() => setTheme('light')}
            className={cn('flex-1 py-1 text-[10px] rounded-md border transition-all', theme === 'light' ? 'border-primary text-primary-soft bg-primary/10' : 'border-border2 text-text-muted bg-surface2')}>
            <Sun size={10} className="inline mr-1" />Light
          </button>
        </div>

        <button onClick={logout} className="flex items-center gap-1.5 text-xs text-text-muted hover:text-danger transition-colors">
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </aside>
  );
}
