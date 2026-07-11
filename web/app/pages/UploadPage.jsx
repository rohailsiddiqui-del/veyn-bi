'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Button, Input, Spinner, EmptyState } from '@/app/components/ui';
import { Upload, FileText, Mic, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/app/lib/utils';

export default function UploadPage() {
  const { apiFetch, token, apiBase } = useAuth();
  const [tab, setTab] = useState('api'); // 'api' | 'manual'
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Manual upload state
  const [batchName, setBatchName] = useState('');
  const [direction, setDirection] = useState('inbound');
  const [evalFile, setEvalFile] = useState(null);
  const [transFile, setTransFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // API pull state
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(yesterday);
  const [dateTo, setDateTo] = useState(today);
  const [pullDirection, setPullDirection] = useState('inbound');
  const [pullBatchName, setPullBatchName] = useState('');
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/upload/batches');
      setBatches(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  async function doUpload() {
    if (!evalFile) { setUploadStatus({ type: 'error', msg: 'Please select an Evaluation CSV file.' }); return; }
    const fd = new FormData();
    fd.append('batchName', batchName || 'Upload ' + new Date().toLocaleDateString());
    fd.append('direction', direction);
    fd.append('eval', evalFile);
    if (transFile) fd.append('trans', transFile);
    setUploading(true);
    setUploadStatus({ type: 'loading', msg: 'Uploading...' });
    try {
      const res = await fetch(apiBase + '/api/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd,
      });
      const data = await res.json();
      setUploadStatus({ type: 'success', msg: data.message + ' Batch ID: ' + data.batchId });
      setEvalFile(null); setTransFile(null); setBatchName('');
      setTimeout(loadBatches, 3000);
    } catch (e) {
      setUploadStatus({ type: 'error', msg: 'Error: ' + e.message });
    } finally { setUploading(false); }
  }

  async function doPull() {
    if (!dateFrom || !dateTo) { setPullStatus({ type: 'error', msg: 'Select a date range.' }); return; }
    setPulling(true);
    setPullStatus({ type: 'loading', msg: 'Connecting to Voice App API...' });
    try {
      const res = await fetch(apiBase + '/api/upload/pull-from-api', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          direction: pullDirection,
          batch_name: pullBatchName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPullStatus({ type: 'error', msg: data.error || 'Pull failed' });
      } else {
        const uploadedAt = new Date().toLocaleString();
        setPullStatus({ type: 'success', msg: data.message + (data.batchId ? ` — Uploaded at ${uploadedAt}. Use this date in the dashboard filter to view these calls.` : '') });
        setPullBatchName('');
        setTimeout(loadBatches, 3000);
      }
    } catch (e) {
      setPullStatus({ type: 'error', msg: 'Error: ' + e.message });
    } finally { setPulling(false); }
  }

  const statusColors = { loading: 'text-text-muted', success: 'text-success', error: 'text-danger' };
  const batchStatusColor = s => s === 'done' ? 'text-success' : s === 'error' ? 'text-danger' : 'text-warning';
  const batchSourceBadge = s => s === 'api'
    ? <span className="text-xs bg-primary/10 text-primary-soft px-2 py-0.5 rounded-full">API</span>
    : <span className="text-xs bg-border2 text-text-muted px-2 py-0.5 rounded-full">Manual</span>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-semibold">Upload Data</h1>
          <p className="text-sm text-text-muted mt-1">Pull data from Voice App API or upload CSV files manually</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('api')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-all',
            tab === 'api' ? 'border-primary bg-primary/10 text-primary-soft' : 'border-border2 text-text-label hover:border-border'
          )}
        >
          <Wifi size={15} />
          Pull from API
        </button>
        <button
          onClick={() => setTab('manual')}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg border text-sm font-medium transition-all',
            tab === 'manual' ? 'border-primary bg-primary/10 text-primary-soft' : 'border-border2 text-text-label hover:border-border'
          )}
        >
          <Upload size={15} />
          Manual Upload
        </button>
      </div>

      {/* API Pull tab */}
      {tab === 'api' && (
        <CardPanel title="Pull from Voice App API" className="mb-6">
          <p className="text-sm text-text-muted mb-4">
            Fetches call evaluations and transcriptions directly from the Voice App API for the selected date range.
            Make sure API credentials are saved in <strong>Settings → API Credentials</strong>.
          </p>

          <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
            <span className="text-primary-soft text-sm mt-0.5">ℹ</span>
            <div className="text-xs text-text-muted leading-relaxed">
              <span className="font-semibold text-text-label">Call Date Range</span> — filters by when the call <em>happened</em> in the Voice App.
              Once pulled, calls are stored with an <span className="font-semibold text-text-label">Upload Date</span> (when they landed here).
              The dashboard filter uses <span className="font-semibold text-text-label">Upload Date</span>.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-1.5 block">Call Date From</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-1.5 block">Call Date To</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>

          <div className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Call Direction</div>
          <div className="flex gap-3 mb-4">
            {[['inbound','📞 Inbound'],['outbound','📤 Outbound'],['mixed','🔀 Mixed']].map(([val, label]) => (
              <label key={val} className={cn(
                'flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border text-sm transition-all duration-150',
                pullDirection === val ? 'border-primary bg-primary/10 text-primary-soft' : 'border-border2 text-text-label hover:border-border'
              )}>
                <input type="radio" name="pull-direction" value={val} checked={pullDirection === val} onChange={() => setPullDirection(val)} className="hidden" />
                {label}
              </label>
            ))}
          </div>

          <Input
            value={pullBatchName}
            onChange={e => setPullBatchName(e.target.value)}
            placeholder={`Batch name (default: API Pull ${dateFrom}/${dateTo})`}
            className="mb-4"
          />

          <Button onClick={doPull} disabled={pulling} className="w-auto px-8" variant="primary">
            <RefreshCw size={14} className={cn('inline mr-2', pulling && 'animate-spin')} />
            {pulling ? 'Fetching...' : 'Pull & Process'}
          </Button>

          {pullStatus && (
            <p className={cn('mt-3 text-sm', statusColors[pullStatus.type])}>{pullStatus.msg}</p>
          )}
        </CardPanel>
      )}

      {/* Manual Upload tab */}
      {tab === 'manual' && (
        <CardPanel title="Manual CSV Upload" className="mb-6">
          <Input
            value={batchName}
            onChange={e => setBatchName(e.target.value)}
            placeholder="Batch name (e.g. June 2026)"
            className="mb-4"
          />

          <div className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-3">Call Direction</div>
          <div className="flex gap-3 mb-5">
            {[['inbound','📞 Inbound'],['outbound','📤 Outbound'],['mixed','🔀 Mixed']].map(([val, label]) => (
              <label key={val} className={cn(
                'flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border text-sm transition-all duration-150',
                direction === val ? 'border-primary bg-primary/10 text-primary-soft' : 'border-border2 text-text-label hover:border-border'
              )}>
                <input type="radio" name="call-direction" value={val} checked={direction === val} onChange={() => setDirection(val)} className="hidden" />
                {label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-5">
            <FileDrop
              icon={<FileText size={28} className="text-text-muted" />}
              label="Evaluation CSV"
              sub="Contains SCORE, Status, agent params"
              file={evalFile}
              accept=".csv"
              onChange={setEvalFile}
            />
            <FileDrop
              icon={<Mic size={28} className="text-text-muted" />}
              label="Transcription CSV"
              sub="Contains formatted_translation, file_name"
              file={transFile}
              accept=".csv"
              onChange={setTransFile}
            />
          </div>

          <Button onClick={doUpload} disabled={uploading} className="w-auto px-8" variant="primary">
            <Upload size={14} className="inline mr-2" />
            {uploading ? 'Uploading...' : 'Upload & Process'}
          </Button>

          {uploadStatus && (
            <p className={cn('mt-3 text-sm', statusColors[uploadStatus.type])}>{uploadStatus.msg}</p>
          )}
        </CardPanel>
      )}

      {/* Upload History */}
      <CardPanel title="Upload History">
        <p className="text-xs text-text-muted mb-3">
          <span className="font-semibold text-text-label">Upload Date</span> is when calls landed in Veyn BI — this is what the dashboard date filter uses.
        </p>
        {loading ? <Spinner /> : batches.length === 0 ? <EmptyState message="No uploads yet" /> : (
          <div className="overflow-x-auto">
            <table className="table-container">
              <thead>
                <tr>
                  <th>Batch Name</th><th>Source</th><th>Eval File</th><th>Calls</th><th>Status</th>
                  <th>
                    <span className="text-primary-soft">Upload Date</span>
                    <span className="block text-text-muted font-normal normal-case tracking-normal text-[10px]">use this for dashboard filter</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.batch_name}</td>
                    <td>{batchSourceBadge(b.source)}</td>
                    <td className="text-text-muted text-xs">{b.eval_filename || '—'}</td>
                    <td>{b.total_calls}</td>
                    <td><span className={batchStatusColor(b.status)}>{b.status}</span></td>
                    <td className="text-xs font-semibold text-text-main">{new Date(b.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardPanel>
    </div>
  );
}

function FileDrop({ icon, label, sub, file, accept, onChange }) {
  return (
    <label className={cn(
      'flex flex-col items-center justify-center p-5 border rounded-xl cursor-pointer transition-all duration-200 text-center',
      file ? 'border-success bg-success/5' : 'border-border2 hover:border-primary-soft hover:bg-primary/5'
    )}>
      <input type="file" accept={accept} className="hidden" onChange={e => onChange(e.target.files[0])} />
      {icon}
      <div className="text-sm font-semibold mt-2 text-text-main">{label}</div>
      <div className="text-xs text-text-muted mt-1">{sub}</div>
      {file && <div className="text-xs text-success font-medium mt-2 truncate max-w-full">{file.name}</div>}
    </label>
  );
}
