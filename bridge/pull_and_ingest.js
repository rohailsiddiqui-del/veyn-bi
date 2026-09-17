/**
 * Pull from Voice App and ingest directly into DB (bypasses HTTP upload).
 * Usage: node pull_and_ingest.js 2026-08-13 2026-08-17
 */
const path = require('path');
// Load dotenv from api directory
require(path.join(__dirname, '../api/node_modules/dotenv')).config({ path: path.join(__dirname, '../api/.env') });
const fs   = require('fs');
const db   = require('../api/src/db');
const { ingestCSVs } = require('../api/src/services/ingest');
const { processBatchInsights } = require('../api/src/services/insights');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

const TENANT_ID = '64030e24-df62-4357-ab0c-087ece964daf'; // Logo Shoes

const startDate = process.argv[2];
const endDate   = process.argv[3];
if (!startDate || !endDate) { console.error('Usage: node pull_and_ingest.js YYYY-MM-DD YYYY-MM-DD'); process.exit(1); }
const range = `${startDate}/${endDate}`;

async function voiceAppLogin() {
  const res = await fetch(`${cfg.evalBaseUrl}/rbac/auth-user/login/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.voiceUsername, password: cfg.voicePassword }),
  });
  if (!res.ok) throw new Error(`Voice App login failed: HTTP ${res.status}`);
  const { data } = await res.json();
  console.log(`[pull] Logged in as ${data.username}`);
  return { token: data.access, orgId: data.org_id };
}

function normaliseTransCSV(raw) {
  if (!raw?.trim()) return raw;
  const lines = raw.split('\n');
  lines[0] = lines[0]
    .replace(/CRI ID/i, 'cri_id').replace(/File Name/i, 'file_name')
    .replace(/Translation/i, 'formatted_translation').replace(/Name/i, 'name').replace(/Path/i, 'path');
  return lines.join('\n');
}

async function run() {
  console.log(`[pull] Logo Shoes — range: ${range}`);

  const { token, orgId } = await voiceAppLogin();

  const evalRes = await fetch(
    `${cfg.evalBaseUrl}/core/call-evaluation/evaluation_list/?download=1&key=duration&order=desc&date_range=${range}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!evalRes.ok) throw new Error(`Eval fetch failed: HTTP ${evalRes.status}`);
  const evalCsv = await evalRes.text();
  console.log(`[pull] Eval rows: ${evalCsv.trim().split('\n').length - 1}`);

  const transRes = await fetch(
    `${cfg.transBaseUrl}/get_all_translations?date_range=${range}&org_id=${orgId}`,
    { headers: { Authorization: `Bearer ${cfg.transToken}` } }
  );
  if (!transRes.ok) throw new Error(`Trans fetch failed: HTTP ${transRes.status}`);
  const transCsv = normaliseTransCSV(await transRes.text());
  console.log(`[pull] Trans rows: ${transCsv.trim().split('\n').length - 1}`);

  // Create batch
  const batchName = `Logo Shoes ${startDate} to ${endDate}`;
  const batchRes = await db.query(
    `INSERT INTO upload_batches (tenant_id, batch_name, eval_filename, trans_filename, status)
     VALUES ($1, $2, 'eval.csv', 'trans.csv', 'processing') RETURNING id`,
    [TENANT_ID, batchName]
  );
  const batchId = batchRes.rows[0].id;
  console.log(`[pull] Batch created: ${batchId}`);

  // Ingest
  const result = await ingestCSVs(TENANT_ID, batchId, evalCsv, transCsv, 'inbound');
  console.log(`[pull] Ingested: ${result.inserted} calls`);
  if (result.errors?.length) console.log('[pull] Errors:', result.errors.slice(0, 3));

  await db.query(
    `UPDATE upload_batches SET total_calls=$1, status='done' WHERE id=$2`,
    [result.inserted, batchId]
  );

  if (result.inserted > 0) {
    console.log('[pull] Running AI insights...');
    const ins = await processBatchInsights(TENANT_ID, batchId);
    console.log(`[pull] Insights: ${ins.processed} ok, ${ins.errors} errors`);
  } else {
    console.log('[pull] No new calls — skipping insights.');
    await db.query(`UPDATE upload_batches SET status='done' WHERE id=$1`, [batchId]);
  }

  console.log('[pull] Done.');
  process.exit(0);
}

run().catch(e => { console.error('[pull] ERROR:', e.message); process.exit(1); });
