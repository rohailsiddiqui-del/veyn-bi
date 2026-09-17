'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Badge, Button, Spinner, EmptyState } from '@/app/components/ui';
import { Plus, Building2, Users, PhoneCall, Power, Trash2, X, Check } from 'lucide-react';

const INDUSTRIES = ['generic','retail','telecom','insurance','healthcare','banking','ecommerce','automotive','education','travel'];
const DASHBOARD_MODES = [
  { value: 'standard', label: 'Standard (call-level)' },
  { value: 'case', label: 'Case Trajectory (multi-interaction)' },
];

function CreateOrgModal({ onClose, onCreated, apiFetch }) {
  const [form, setForm] = useState({ tenantName: '', industry: 'generic', dashboard_mode: 'standard', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiFetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-main">Create New Organisation</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-main transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1">Organisation Name</label>
            <input
              required
              value={form.tenantName}
              onChange={e => setForm(f => ({ ...f, tenantName: e.target.value }))}
              placeholder="e.g. Almosafer"
              className="w-full bg-bg border border-border2 rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-muted mb-1">Industry</label>
              <select
                value={form.industry}
                onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                className="w-full bg-bg border border-border2 rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary outline-none"
              >
                {INDUSTRIES.map(i => <option key={i} value={i}>{i.charAt(0).toUpperCase() + i.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Dashboard Mode</label>
              <select
                value={form.dashboard_mode}
                onChange={e => setForm(f => ({ ...f, dashboard_mode: e.target.value }))}
                className="w-full bg-bg border border-border2 rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary outline-none"
              >
                {DASHBOARD_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Admin Email</label>
            <input
              required type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="admin@client.com"
              className="w-full bg-bg border border-border2 rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Password</label>
            <input
              required type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Set initial password"
              className="w-full bg-bg border border-border2 rounded-lg px-3 py-2 text-sm text-text-main focus:border-primary outline-none"
            />
          </div>
          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-sm border border-border2 rounded-lg text-text-muted hover:text-text-main transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Spinner size={14} /> : <Check size={14} />}
              Create Org
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function modeBadge(mode) {
  if (mode === 'case') return <Badge variant="purple">Case Trajectory</Badge>;
  return <Badge variant="green">Standard</Badge>;
}

export default function AdminPage() {
  const { apiFetch } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/admin/tenants');
      setTenants(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(tenant) {
    try {
      await apiFetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !tenant.is_active }),
      });
      load();
    } catch (e) { alert(e.message); }
  }

  async function deleteTenant(id) {
    try {
      await apiFetch(`/api/admin/tenants/${id}`, { method: 'DELETE' });
      setConfirmDelete(null);
      load();
    } catch (e) { alert(e.message); }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-main">Organisations</h3>
          <p className="text-xs text-text-muted mt-0.5">{tenants.length} org{tenants.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-primary text-white text-sm px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} /> New Org
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Orgs', value: tenants.length, icon: Building2 },
          { label: 'Active', value: tenants.filter(t => t.is_active !== false).length, icon: Check },
          { label: 'Total Calls', value: tenants.reduce((s, t) => s + Number(t.call_count || 0), 0).toLocaleString(), icon: PhoneCall },
        ].map(({ label, value, icon: Icon }) => (
          <CardPanel key={label}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg"><Icon size={16} className="text-primary-soft" /></div>
              <div>
                <div className="text-xl font-bold text-text-main">{value}</div>
                <div className="text-xs text-text-muted">{label}</div>
              </div>
            </div>
          </CardPanel>
        ))}
      </div>

      {/* Tenant table */}
      <CardPanel>
        {loading ? (
          <div className="flex justify-center py-10"><Spinner /></div>
        ) : tenants.length === 0 ? (
          <EmptyState title="No organisations yet" description="Create your first org to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Organisation','Industry','Dashboard Mode','Users','Calls','Status','Actions'].map(h => (
                    <th key={h} className="text-left text-xs text-text-muted font-medium py-2 px-3 first:pl-0 last:pr-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tenants.map(t => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface2/50 transition-colors">
                    <td className="py-3 px-3 pl-0">
                      <div className="font-medium text-text-main">{t.name}</div>
                      <div className="text-[10px] text-text-muted font-mono">{t.slug}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-text-label capitalize">{t.industry || 'generic'}</span>
                    </td>
                    <td className="py-3 px-3">{modeBadge(t.dashboard_mode)}</td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1 text-xs text-text-label"><Users size={11} />{t.user_count}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1 text-xs text-text-label"><PhoneCall size={11} />{Number(t.call_count).toLocaleString()}</span>
                    </td>
                    <td className="py-3 px-3">
                      {t.is_active !== false
                        ? <Badge variant="green">Active</Badge>
                        : <Badge variant="red">Disabled</Badge>}
                    </td>
                    <td className="py-3 px-3 pr-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(t)}
                          title={t.is_active !== false ? 'Disable org' : 'Enable org'}
                          className="p-1.5 rounded-md border border-border2 text-text-muted hover:text-text-main hover:border-border transition-colors"
                        >
                          <Power size={12} />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(t)}
                          title="Delete org"
                          className="p-1.5 rounded-md border border-border2 text-text-muted hover:text-red-400 hover:border-red-400/50 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardPanel>

      {/* Create modal */}
      {showCreate && (
        <CreateOrgModal
          apiFetch={apiFetch}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <h3 className="font-semibold text-text-main">Delete "{confirmDelete.name}"?</h3>
            <p className="text-xs text-text-muted">This will permanently delete the org and <strong className="text-text-label">all associated calls, insights, and data</strong>. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 text-sm border border-border2 rounded-lg text-text-muted hover:text-text-main transition-colors">
                Cancel
              </button>
              <button onClick={() => deleteTenant(confirmDelete.id)}
                className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
