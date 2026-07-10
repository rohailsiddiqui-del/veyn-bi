'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { CardPanel, Button, Input, Spinner, EmptyState } from '@/app/components/ui';
import { Upload, FileText, Mic } from 'lucide-react';
import { cn } from '@/app/lib/utils';

export default function UploadPage() {
  const { apiFetch, token, apiBase } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batchName, setBatchName] = useState('');
  const [direction, setDirection] = useState('inbound');
  const [evalFile, setEvalFile] = useState(null);
  const [transFile, setTransFile] = useState(null);
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);

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
    if (!evalFile) { setStatus({ type: 'error', msg: 'Please select an Evaluation CSV file.' }); return; }
    const fd = new FormData();
    fd.append('batchName', batchName || 'Upload ' + new Date().toLocaleDateString());
    fd.append('direction', direction);
    fd.append('eval', evalFile);
    if (transFile) fd.append('trans', transFile);
    setUploading(true);
    setStatus({ type: 'loading', msg: 'Uploading...' });
    try {
      const res = await fetch(apiBase + '/api/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd,
      });
      const data = await res.json();
      setStatus({ type: 'success', msg: data.message + ' Batch ID: ' + data.batchId });
      setEvalFile(null); setTransFile(null); setBatchName('');
      setTimeout(loadBatches, 3000);
    } catch (e) {
      setStatus({ type: 'error', msg: 'Error: ' + e.message });
    } finally { setUploading(false); }
  }

  const statusColors = { loading: 'text-text-muted', success: 'text-success', error: 'text-danger' };
  const batchStatusColor = s => s === 'done' ? 'text-success' : s === 'error' ? 'text-danger' : 'text-warning';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-2xl font-semibold">Upload Data</h1>
          <p className="text-sm text-text-muted mt-1">Upload QA evaluation and transcription CSVs</p>
        </div>
      </div>

      <CardPanel title="New Upload" className="mb-6">
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

        <Button
          onClick={doUpload}
          disabled={uploading}
          className="w-auto px-8"
          variant="primary"
        >
          <Upload size={14} className="inline mr-2" />
          {uploading ? 'Uploading...' : 'Upload & Process'}
        </Button>

        {status && (
          <p className={cn('mt-3 text-sm', statusColors[status.type])}>{status.msg}</p>
        )}
      </CardPanel>

      <CardPanel title="Upload History">
        {loading ? <Spinner /> : batches.length === 0 ? <EmptyState message="No uploads yet" /> : (
          <div className="overflow-x-auto">
            <table className="table-container">
              <thead>
                <tr>
                  <th>Batch Name</th><th>Eval File</th><th>Calls</th><th>Status</th><th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id}>
                    <td className="font-medium">{b.batch_name}</td>
                    <td className="text-text-muted text-xs">{b.eval_filename || '—'}</td>
                    <td>{b.total_calls}</td>
                    <td><span className={batchStatusColor(b.status)}>{b.status}</span></td>
                    <td className="text-text-muted text-xs">{new Date(b.created_at).toLocaleString()}</td>
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
