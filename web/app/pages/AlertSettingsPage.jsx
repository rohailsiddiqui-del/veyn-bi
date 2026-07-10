'use client';
import { useState, useEffect } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Button, Input, Spinner } from '@/app/components/ui';
import { cn } from '@/app/lib/utils';
import { Bell, Info, AlertTriangle, Key } from 'lucide-react';

export default function AlertSettingsPage() {
  const { apiFetch, token, apiBase } = useAuth();
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [threatEnabled, setThreatEnabled] = useState(false);
  const [escalationEnabled, setEscalationEnabled] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // API credentials state
  const [apiUsername, setApiUsername] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [apiOrgId, setApiOrgId] = useState('');
  const [apiEvalUrl, setApiEvalUrl] = useState('https://autovox-be.veyn.co.uk');
  const [apiTransUrl, setApiTransUrl] = useState('https://autovox-translation-api.veyn.ai');
  const [apiTransToken, setApiTransToken] = useState('');
  const [credStatus, setCredStatus] = useState(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await apiFetch('/api/settings/alerts');
        setAlertsEnabled(!!data.alerts_enabled);
        setAlertEmail(data.alert_email || '');
        setThreatEnabled((data.alert_signals || []).includes('threat'));
        setEscalationEnabled((data.alert_signals || []).includes('escalation'));
      } catch (e) { console.error(e); }

      try {
        const creds = await apiFetch('/api/settings/api-credentials');
        setApiUsername(creds.username || '');
        setApiOrgId(creds.org_id ? String(creds.org_id) : '');
        setApiEvalUrl(creds.eval_url || 'https://autovox-be.veyn.co.uk');
        setApiTransUrl(creds.trans_url || 'https://autovox-translation-api.veyn.ai');
        setApiTransToken(creds.trans_token || '');
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    loadSettings();
  }, [apiFetch]);


  async function saveSettings() {
    if (alertsEnabled && !alertEmail.trim()) {
      setSaveStatus({ type: 'error', msg: 'Please enter at least one email address.' });
      return;
    }
    setSaveStatus({ type: 'loading', msg: 'Saving...' });
    const signals = [];
    if (threatEnabled) signals.push('threat');
    if (escalationEnabled) signals.push('escalation');
    try {
      await apiFetch('/api/settings/alerts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_email: alertEmail.trim(), alert_signals: signals, alerts_enabled: alertsEnabled }),
      });
      setSaveStatus({ type: 'success', msg: '✓ Settings saved' });
    } catch (e) { setSaveStatus({ type: 'error', msg: 'Error: ' + e.message }); }
  }

  async function sendTestEmail() {
    setSaveStatus({ type: 'loading', msg: 'Sending test...' });
    try {
      const res = await fetch(apiBase + '/api/settings/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSaveStatus({ type: 'success', msg: '✓ ' + data.message });
    } catch (e) { setSaveStatus({ type: 'error', msg: 'Error: ' + e.message }); }
  }

  async function saveCredentials() {
    setCredStatus({ type: 'loading', msg: 'Saving...' });
    try {
      await apiFetch('/api/settings/api-credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: apiUsername, password: apiPassword || undefined,
          org_id: apiOrgId ? parseInt(apiOrgId) : null,
          eval_url: apiEvalUrl, trans_url: apiTransUrl, trans_token: apiTransToken,
        }),
      });
      setApiPassword('');
      setCredStatus({ type: 'success', msg: '✓ Credentials saved' });
    } catch (e) { setCredStatus({ type: 'error', msg: 'Error: ' + e.message }); }
  }

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-semibold">Alert Settings</h1>
          <p className="text-sm text-text-muted mt-1">Get notified by email when threat or escalation calls are detected</p>
        </div>
      </div>

      <div className="max-w-xl space-y-5">
        <CardPanel title="Email Notifications">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer mb-5">
            <div className="relative">
              <input type="checkbox" checked={alertsEnabled} onChange={e => setAlertsEnabled(e.target.checked)} className="sr-only peer" />
              <div className="w-10 h-6 bg-border2 rounded-full peer-checked:bg-primary transition-colors duration-200" />
              <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-4" />
            </div>
            <span className="text-sm text-text-main">Enable alert emails after each batch is processed</span>
          </label>

          {/* Email input */}
          <div className="mb-4">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-2">Alert Email Address(es)</label>
            <Input
              type="text"
              value={alertEmail}
              onChange={e => setAlertEmail(e.target.value)}
              placeholder="manager@company.com, director@company.com"
            />
            <p className="text-xs text-text-muted mt-1">Separate multiple addresses with commas</p>
          </div>

          {/* Signal types */}
          <div className="mb-5">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Alert On</div>
            <div className="flex gap-3">
              <AlertToggle label="⚠️ Threat calls" checked={threatEnabled} onChange={setThreatEnabled} />
              <AlertToggle label="🔺 Escalation calls" checked={escalationEnabled} onChange={setEscalationEnabled} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button onClick={saveSettings} className="w-auto px-6">Save Settings</Button>
            <button
              onClick={sendTestEmail}
              className="text-xs text-text-muted bg-surface2 border border-border2 rounded-lg px-4 py-2 hover:border-primary-soft hover:text-primary-soft transition-colors cursor-pointer"
            >
              Send Test Email
            </button>
            {saveStatus && (
              <span className={cn('text-xs', saveStatus.type === 'success' ? 'text-success' : saveStatus.type === 'error' ? 'text-danger' : 'text-text-muted')}>
                {saveStatus.msg}
              </span>
            )}
          </div>
        </CardPanel>

        <CardPanel title="How It Works">
          <div className="space-y-3 text-sm text-text-label leading-relaxed">
            <div className="flex items-start gap-2"><Bell size={14} className="mt-0.5 flex-shrink-0 text-primary-soft" /><span><strong className="text-text-main">When:</strong> After every batch of calls is processed through AI insights</span></div>
            <div className="flex items-start gap-2"><Info size={14} className="mt-0.5 flex-shrink-0 text-info" /><span><strong className="text-text-main">What:</strong> One email listing all threat and escalation calls from that batch</span></div>
            <div className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-warning" /><span><strong className="text-text-main">Backtrack:</strong> Each call includes agent name, date, flag details — go to Insights → Flagged Calls to view</span></div>
          </div>
        </CardPanel>

        <CardPanel title="API Credentials">
          <p className="text-sm text-text-muted mb-4">
            Voice App credentials used by the <strong>Pull from API</strong> feature on the Upload page.
            Password field is write-only — leave blank to keep the current password.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-1.5">Username</label>
              <Input value={apiUsername} onChange={e => setApiUsername(e.target.value)} placeholder="logoadmin" />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-1.5">Password</label>
              <Input type="password" value={apiPassword} onChange={e => setApiPassword(e.target.value)} placeholder="Leave blank to keep current" />
            </div>
          </div>
          <div className="mb-3">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-1.5">Org ID</label>
            <Input value={apiOrgId} onChange={e => setApiOrgId(e.target.value)} placeholder="64" className="max-w-[120px]" />
          </div>
          <div className="mb-3">
            <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-1.5">Eval Base URL</label>
            <Input value={apiEvalUrl} onChange={e => setApiEvalUrl(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 mb-4">
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-1.5">Translation Base URL</label>
              <Input value={apiTransUrl} onChange={e => setApiTransUrl(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-widest block mb-1.5">Translation Static Token</label>
              <Input value={apiTransToken} onChange={e => setApiTransToken(e.target.value)} placeholder="d1cf7f8c..." />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveCredentials} className="w-auto px-6">
              <Key size={13} className="inline mr-1.5" />
              Save Credentials
            </Button>
            {credStatus && (
              <span className={cn('text-xs', credStatus.type === 'success' ? 'text-success' : credStatus.type === 'error' ? 'text-danger' : 'text-text-muted')}>
                {credStatus.msg}
              </span>
            )}
          </div>
        </CardPanel>
      </div>
    </div>
  );
}

function AlertToggle({ label, checked, onChange }) {
  return (
    <label className={cn(
      'flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border text-sm transition-all duration-150',
      checked ? 'border-primary bg-primary/10 text-primary-soft' : 'border-border2 text-text-label hover:border-border'
    )}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="hidden" />
      {label}
    </label>
  );
}
