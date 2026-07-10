/**
 * Veyn BI Bridge — fetches eval + transcription CSVs from the Voice App API
 * and pushes them to the GCP Veyn BI API for ingestion.
 *
 * Runs on any machine on the office WiFi (10.0.0.x network).
 * Schedule via PM2 or Windows Task Scheduler.
 *
 * Config: edit config.json in this folder (created on first run if missing).
 */

const fs   = require('fs');
const path = require('path');
const FormData = require('form-data');

// ── Config ────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_CONFIG = {
  // Voice App — eval + login (public)
  evalBaseUrl:    'https://autovox-be.veyn.co.uk',
  voiceUsername:  'aihadmin',
  voicePassword:  'aih@321',

  // Voice App — translation API (public, static token)
  transBaseUrl:   'https://autovox-translation-api.veyn.ai',
  transToken:     'd1cf7f8c46caf960cae2ff929796a3bc7bedd191364db10f2edc4fa7f5abfd4a',
  orgId:           45,

  // Veyn BI GCP API
  gcpApiUrl:      'http://34.27.148.238:4000',
  gcpEmail:       'admin@logoshoes.com',
  gcpPassword:    'test123',

  // Fetch settings
  daysBack:        1,          // how many days of data to fetch per run
  direction:      'inbound',   // inbound | outbound | mixed
  batchPrefix:    'Auto',      // batch name prefix
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log('[bridge] Created config.json — please edit it before running.');
    process.exit(0);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateRange(daysBack) {
  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - daysBack);
  const fmt = d => d.toISOString().slice(0, 10);
  return `${fmt(start)}/${fmt(end)}`;
}

async function voiceAppLogin(cfg) {
  const url = `${cfg.evalBaseUrl}/rbac/auth-user/login/`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username: cfg.voiceUsername, password: cfg.voicePassword }),
  });
  if (!res.ok) throw new Error(`Voice App login failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.data?.access) throw new Error('No access token in login response');
  console.log(`[bridge] Logged in as ${data.data.username} (org: ${data.data.org}, org_id: ${data.data.org_id})`);
  return { token: data.data.access, orgId: data.data.org_id };
}

async function fetchEvalCSV(cfg, token, range) {
  const url = `${cfg.evalBaseUrl}/core/call-evaluation/evaluation_list/?download=1&key=duration&order=desc&date_range=${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Eval fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  console.log(`[bridge] Fetched eval CSV (${text.length} bytes)`);
  return text;
}

async function fetchTransCSV(cfg, orgId, range) {
  const url = `${cfg.transBaseUrl}/get_all_translations?date_range=${range}&org_id=${orgId}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.transToken}` } });
  if (!res.ok) throw new Error(`Translation fetch failed: HTTP ${res.status}`);
  const text = await res.text();
  console.log(`[bridge] Fetched translation CSV (${text.length} bytes)`);
  return text;
}

/**
 * The transcription CSV columns from the Voice App are:
 *   CRI ID | Name | File Name | Path | Translation
 *
 * The ingest service expects:
 *   file_name | formatted_translation
 *
 * This function renames the columns so ingest.js can parse them correctly.
 */
function normaliseTransCSV(rawCsv) {
  if (!rawCsv || !rawCsv.trim()) return rawCsv;
  const lines = rawCsv.split('\n');
  if (!lines.length) return rawCsv;

  // Remap header
  lines[0] = lines[0]
    .replace(/CRI ID/i,      'cri_id')
    .replace(/File Name/i,   'file_name')
    .replace(/Translation/i, 'formatted_translation')
    .replace(/Name/i,        'name')
    .replace(/Path/i,        'path');

  return lines.join('\n');
}

async function gcpLogin(cfg) {
  const res = await fetch(`${cfg.gcpApiUrl}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: cfg.gcpEmail, password: cfg.gcpPassword }),
  });
  if (!res.ok) throw new Error(`GCP login failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error('No token in GCP login response');
  console.log(`[bridge] GCP login ok`);
  return data.token;
}

async function pushToGCP(cfg, gcpToken, evalCsv, transCsv, batchName) {
  const form = new FormData();
  form.append('eval', Buffer.from(evalCsv, 'utf-8'), { filename: 'eval.csv', contentType: 'text/csv' });
  if (transCsv) {
    form.append('trans', Buffer.from(transCsv, 'utf-8'), { filename: 'trans.csv', contentType: 'text/csv' });
  }
  form.append('batchName', batchName);
  form.append('direction',  cfg.direction || 'inbound');

  const res = await fetch(`${cfg.gcpApiUrl}/api/upload`, {
    method:  'POST',
    headers: { ...form.getHeaders(), Authorization: `Bearer ${gcpToken}` },
    body:    form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GCP upload failed: HTTP ${res.status} — ${err}`);
  }
  const data = await res.json();
  console.log(`[bridge] GCP upload accepted — batchId: ${data.batchId}`);
  return data.batchId;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`\n[bridge] Starting — ${new Date().toISOString()}`);

  const cfg   = loadConfig();
  const range = dateRange(cfg.daysBack || 1);
  console.log(`[bridge] Date range: ${range}`);

  // 1. Login to Voice App
  const { token: voiceToken, orgId } = await voiceAppLogin(cfg);

  // 2. Fetch CSVs
  const evalCsv  = await fetchEvalCSV(cfg, voiceToken, range);
  const rawTrans = await fetchTransCSV(cfg, orgId, range);
  const transCsv = normaliseTransCSV(rawTrans);

  // 3. Login to GCP
  const gcpToken = await gcpLogin(cfg);

  // 4. Push to GCP
  const batchName = `${cfg.batchPrefix || 'Auto'} ${range}`;
  const batchId   = await pushToGCP(cfg, gcpToken, evalCsv, transCsv, batchName);

  console.log(`[bridge] Done — batchId: ${batchId}`);
}

run().catch(e => {
  console.error('[bridge] ERROR:', e.message);
  process.exit(1);
});
