'use client';
import { useState, useEffect, useCallback } from 'react';
import { CardPanel, Spinner, EmptyState } from '@/app/components/ui';
import { useAuth } from '@/app/context/AuthContext';
import { MapPin, PhoneIncoming, PhoneOutgoing, AlertCircle, RefreshCw } from 'lucide-react';

const PORTAL_META = {
  complaint_inbound:  { label: 'Complaint Inbound',  color: '#F59E0B', Icon: PhoneIncoming },
  complaint_outbound: { label: 'Complaint Outbound', color: '#EF4444', Icon: PhoneOutgoing },
};

function fmt(n) { return n === null || n === undefined ? '—' : n; }

export default function LocationPage() {
  const { apiFetch, globalDateFrom, globalDateTo } = useAuth();
  const [branches, setBranches] = useState([]);
  const [portalFilter, setPortalFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (globalDateFrom) p.set('from', globalDateFrom);
      if (globalDateTo)   p.set('to',   globalDateTo);
      const data = await apiFetch(`/api/group/branches?${p}`);
      setBranches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, globalDateFrom, globalDateTo]);

  useEffect(() => { load(); }, [load]);

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setExtractStatus('');
    try {
      const data = await apiFetch('/api/group/branches/extract', { method: 'POST' });
      setExtractStatus(data.message || 'Extraction started');
      // Reload after a delay to pick up newly extracted branch names
      setTimeout(() => load(), 8000);
    } catch (e) {
      setExtractStatus('Error: ' + e.message);
    } finally {
      setExtracting(false);
    }
  }, [apiFetch, load]);

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner /></div>;

  const filtered = portalFilter === 'all'
    ? branches
    : branches.filter(b => b.portal_type === portalFilter);

  // Aggregate by branch across portals
  const branchMap = {};
  for (const b of filtered) {
    if (!branchMap[b.branch_name]) {
      branchMap[b.branch_name] = { branch_name: b.branch_name, total: 0, inbound: 0, outbound: 0, resolved: 0, unresolved: 0 };
    }
    const entry = branchMap[b.branch_name];
    const count = parseInt(b.total_complaints || 0);
    entry.total += count;
    if (b.portal_type === 'complaint_inbound')  entry.inbound  += count;
    if (b.portal_type === 'complaint_outbound') entry.outbound += count;
    entry.resolved   += parseInt(b.resolved || 0);
    entry.unresolved += parseInt(b.unresolved || 0);
  }

  const sorted = Object.values(branchMap).sort((a, b) => b.total - a.total);
  const maxCount = sorted[0]?.total || 1;

  if (!sorted.length) {
    return (
      <div className="space-y-4">
        <EmptyState
          message="No branch data yet. Branch names in your call uploads will appear here."
          icon={<MapPin size={32} className="text-text-muted" />}
        />
        <div className="text-xs text-text-muted text-center">
          Tip: Add a "branch_name" column to your CSV uploads to track complaints by location.
        </div>
      </div>
    );
  }

  const totalComplaints = sorted.reduce((s, b) => s + b.total, 0);
  const worstBranch = sorted[0];

  return (
    <div className="space-y-6">

      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-main tracking-tight">Branch Analytics</h1>
          <p className="text-xs text-text-muted mt-0.5">Complaints by branch — extracted from call transcripts</p>
        </div>
        <div className="flex items-center gap-3">
          {extractStatus && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-lg ${
              extractStatus.startsWith('Error') ? 'bg-danger/10 text-danger' : 'bg-primary/10 text-primary-soft'
            }`}>
              {extractStatus}
            </span>
          )}
          <button
            onClick={handleExtract}
            disabled={extracting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary-soft text-sm font-medium hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={13} className={extracting ? 'animate-spin' : ''} />
            {extracting ? 'Extracting…' : 'Extract Branch Names'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'complaint_inbound', 'complaint_outbound'].map(type => (
          <button
            key={type}
            onClick={() => setPortalFilter(type)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
              portalFilter === type
                ? 'bg-primary text-white border-primary'
                : 'border-border text-text-muted hover:border-border2'
            }`}
          >
            {type === 'all' ? 'All Complaints' : PORTAL_META[type]?.label}
          </button>
        ))}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1">Total Complaints</div>
          <div className="text-2xl font-bold text-text-main">{totalComplaints}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1">Branches Affected</div>
          <div className="text-2xl font-bold text-text-main">{sorted.length}</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1">Worst Branch</div>
          <div className="text-sm font-bold text-red-400 truncate">{worstBranch?.branch_name || '—'}</div>
          <div className="text-xs text-text-muted">{worstBranch?.total} complaints</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="text-xs text-text-muted mb-1">Resolution Rate</div>
          <div className="text-2xl font-bold text-emerald-400">
            {totalComplaints > 0
              ? `${((sorted.reduce((s, b) => s + b.resolved, 0) / totalComplaints) * 100).toFixed(0)}%`
              : '—'}
          </div>
        </div>
      </div>

      {/* Branch breakdown */}
      <CardPanel title="Complaints by Branch">
        <div className="space-y-3 mt-3">
          {sorted.map((b, i) => {
            const pct = (b.total / maxCount) * 100;
            const resPct = b.total > 0 ? (b.resolved / b.total) * 100 : 0;
            return (
              <div key={b.branch_name} className="group">
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex items-center gap-1.5 w-52 shrink-0">
                    <MapPin size={12} className="text-text-muted shrink-0" />
                    <span className="text-sm font-medium text-text-main truncate">{b.branch_name}</span>
                  </div>
                  <div className="flex-1 bg-surface2 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: pct > 66 ? '#EF4444' : pct > 33 ? '#F59E0B' : '#10B981' }}
                    />
                  </div>
                  <div className="text-sm font-bold text-text-main w-8 text-right shrink-0">{b.total}</div>
                </div>
                <div className="flex items-center gap-3 pl-[14px] ml-[192px]">
                  {b.inbound > 0 && (
                    <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                      <PhoneIncoming size={9} /> {b.inbound} inbound
                    </span>
                  )}
                  {b.outbound > 0 && (
                    <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                      <PhoneOutgoing size={9} /> {b.outbound} outbound
                    </span>
                  )}
                  <span className="text-[10px] text-emerald-400 ml-auto">
                    {resPct.toFixed(0)}% resolved
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardPanel>

      {/* Detailed table */}
      <CardPanel title="Branch Detail Table">
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-muted text-xs border-b border-border">
                <th className="text-left pb-2 pr-4">Branch</th>
                <th className="text-right pb-2 pr-4">Total</th>
                <th className="text-right pb-2 pr-4">Inbound</th>
                <th className="text-right pb-2 pr-4">Outbound</th>
                <th className="text-right pb-2 pr-4">Resolved</th>
                <th className="text-right pb-2">Res. Rate</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b, i) => {
                const resPct = b.total > 0 ? ((b.resolved / b.total) * 100).toFixed(0) : '—';
                return (
                  <tr key={b.branch_name} className="border-b border-border/40 hover:bg-surface/60">
                    <td className="py-2 pr-4 font-medium text-text-main flex items-center gap-1.5">
                      <MapPin size={11} className="text-text-muted" />
                      {b.branch_name}
                    </td>
                    <td className="py-2 pr-4 text-right font-bold text-text-main">{b.total}</td>
                    <td className="py-2 pr-4 text-right text-amber-400">{b.inbound || 0}</td>
                    <td className="py-2 pr-4 text-right text-red-400">{b.outbound || 0}</td>
                    <td className="py-2 pr-4 text-right text-emerald-400">{b.resolved || 0}</td>
                    <td className={`py-2 text-right font-semibold ${
                      parseInt(resPct) >= 70 ? 'text-emerald-400' : parseInt(resPct) >= 40 ? 'text-amber-400' : 'text-red-400'
                    }`}>{resPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardPanel>
    </div>
  );
}
