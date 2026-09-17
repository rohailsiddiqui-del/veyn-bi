/**
 * One-off targeted pull for specific date range.
 * Usage: node pull_dates.js 2026-08-15 2026-08-16
 */
const fs   = require('fs');
const path = require('path');
const FormData = require('form-data');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const startDate = process.argv[2];
const endDate   = process.argv[3];
if (!startDate || !endDate) { console.error('Usage: node pull_dates.js YYYY-MM-DD YYYY-MM-DD'); process.exit(1); }
const range = `${startDate}/${endDate}`;

async function voiceAppLogin() {
  const res = await fetch(`${cfg.evalBaseUrl}/rbac/auth-user/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.voiceUsername, password: cfg.voicePassword }),
  });
  if (!res.ok) throw new Error(`Voice App login failed: HTTP ${res.status}`);
  const data = await res.json();
  console.log(`[pull] Logged in as ${data.data.username}`);
  return { token: data.data.access, orgId: data.data.org_id };
}

async function fetchEvalCSV(token) {
  const url = `${cfg.evalBaseUrl}/core/call-evaluation/evaluation_list/?download=1&key=duration&order=desc&date_range=${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Eval fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  console.log(`[pull] Eval CSV: ${text.split('\n').length - 1} rows`);
  return text;
}

async function fetchTransCSV(orgId) {
  const url = `${cfg.transBaseUrl}/get_all_translations?date_range=${range}&org_id=${orgId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.transToken}` } });
  if (!res.ok) throw new Error(`Translation fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  console.log(`[pull] Trans CSV: ${text.split('\n').length - 1} rows`);
  return text;
}

function normaliseTransCSV(rawCsv) {
  if (!rawCsv?.trim()) return rawCsv;
  const lines = rawCsv.split('\n');
  lines[0] = lines[0]
    .replace(/CRI ID/i, 'cri_id').replace(/File Name/i, 'file_name')
    .replace(/Translation/i, 'formatted_translation').replace(/Name/i, 'name').replace(/Path/i, 'path');
  return lines.join('\n');
}

async function gcpLogin() {
  const res = await fetch(`${cfg.gcpApiUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.gcpEmail, password: cfg.gcpPassword }),
  });
  if (!res.ok) throw new Error(`GCP login failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.token;
}

async function pushToGCP(gcpToken, evalCsv, transCsv, batchName) {
  const form = new FormData();
  form.append('eval', Buffer.from(evalCsv, 'utf-8'), { filename: 'eval.csv', contentType: 'text/csv' });
  if (transCsv) form.append('trans', Buffer.from(transCsv, 'utf-8'), { filename: 'trans.csv', contentType: 'text/csv' });
  form.append('batchName', batchName);
  form.append('direction', cfg.direction || 'inbound');
  const res = await fetch(`${cfg.gcpApiUrl}/api/upload`, {
    method: 'POST', headers: { ...form.getHeaders(), Authorization: `Bearer ${gcpToken}` }, body: form,
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`GCP upload failed: HTTP ${res.status} — ${err}`); }
  const data = await res.json();
  console.log(`[pull] Uploaded — batchId: ${data.batchId}`);
  return data.batchId;
}

async function run() {
  console.log(`[pull] Fetching Logo Shoes data for range: ${range}`);
  const { token, orgId } = await voiceAppLogin();
  const evalCsv  = await fetchEvalCSV(token);
  const transCsv = normaliseTransCSV(await fetchTransCSV(orgId));
  const gcpToken = await gcpLogin();
  const batchName = `Logo Shoes ${startDate} to ${endDate}`;
  await pushToGCP(gcpToken, evalCsv, transCsv, batchName);
  console.log('[pull] Done.');
}

run().catch(e => { console.error('[pull] ERROR:', e.message); process.exit(1); });
