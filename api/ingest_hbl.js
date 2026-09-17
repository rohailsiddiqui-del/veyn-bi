require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { execSync } = require('child_process');
const db   = require('./src/db');
const { processBatchInsights } = require('./src/services/insights');

const TENANT_ID = '8e444034-163c-4622-9c6f-569ea9b1f74d'; // HBL - Call Center
const HBL_DIR   = '/home/simplyrms/d_drive_mount/Openclaw work/HBL Data';
const EVAL_FILE = path.join(HBL_DIR, 'Data_20260817_123642_12_36 PM.csv');

// Map agent first name (from eval CSV) → transcription PDF path
const TRANSCRIPTION_MAP = {
  'malaika':        path.join(HBL_DIR, 'Malaika- Fraud case.pdf'),
  'muhammad zubair':path.join(HBL_DIR, 'Muhammad Zubair - Debit card activation.pdf'),
  'maheen':         path.join(HBL_DIR, 'Maheen-Credit Card payment.pdf'),
  'laiba qadeer':   path.join(HBL_DIR, 'Laiba Qadeer-Debit Card Replacement.pdf'),
  'shahbaz':        path.join(HBL_DIR, 'Shahbaz-Mobile app block.pdf'),
};

function extractPDFText(pdfPath) {
  try {
    return execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf-8' });
  } catch (e) {
    console.warn(`  ⚠️  Could not extract PDF: ${pdfPath}`);
    return null;
  }
}

function parseDuration(str) {
  // "00:03:49" → seconds
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function parseCallDate(str) {
  // "14/05/2026" → "2026-05-14"
  if (!str) return null;
  const [d, m, y] = str.split('/');
  if (y && m && d) return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  return null;
}

async function run() {
  console.log('[hbl-ingest] Starting HBL ingest...');

  const evalText = fs.readFileSync(EVAL_FILE, 'utf-8');
  const rows = parse(evalText, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`[hbl-ingest] Found ${rows.length} calls in eval CSV`);

  // Identify param columns (everything except meta columns)
  const META_COLS = new Set(['Name','Duration','CLI','Upload Date & Time','Call Date & Time','Status','SCORE']);
  const paramCols = Object.keys(rows[0]).filter(c => !META_COLS.has(c));
  console.log(`[hbl-ingest] Param columns: ${paramCols.join(', ')}`);

  // Create batch
  const batchRes = await db.query(
    `INSERT INTO upload_batches (tenant_id, batch_name, eval_filename, trans_filename, status)
     VALUES ($1, 'HBL Pilot Batch - May 2026', 'Data_20260817.csv', 'PDFs', 'processing')
     RETURNING id`,
    [TENANT_ID]
  );
  const batchId = batchRes.rows[0].id;
  console.log(`[hbl-ingest] Batch: ${batchId}`);

  let inserted = 0;
  for (const row of rows) {
    const agentName    = (row['Name'] || '').trim();
    const nameKey      = agentName.toLowerCase();
    const duration     = parseDuration(row['Duration']);
    const callDate     = parseCallDate((row['Call Date & Time'] || '').split(' ')[0]);
    const status       = (row['Status'] || '').trim();
    const score        = parseFloat(row['SCORE'] || 0);
    const callRef      = `hbl-${nameKey.replace(/\s+/g,'-')}-${callDate || 'unknown'}`;

    // Insert call
    const callRes = await db.query(
      `INSERT INTO calls (tenant_id, batch_id, call_ref, agent_name, call_date, call_duration_seconds, direction, status, score, has_transcript)
       VALUES ($1,$2,$3,$4,$5,$6,'inbound',$7,$8,true)
       ON CONFLICT (tenant_id, call_ref) DO NOTHING RETURNING id`,
      [TENANT_ID, batchId, callRef, agentName, callDate, duration, status, score]
    );
    if (!callRes.rows[0]) { console.log(`  ⚠️  Duplicate: ${agentName}`); continue; }
    const callId = callRes.rows[0].id;
    console.log(`  ✔  ${agentName} (${callRef}) → ${callId}`);

    // Param scores
    for (const col of paramCols) {
      const val = parseFloat(row[col]);
      if (!isNaN(val)) {
        await db.query(
          'INSERT INTO call_param_scores (call_id, tenant_id, param_name, score) VALUES ($1,$2,$3,$4)',
          [callId, TENANT_ID, col, val]
        );
      }
    }

    // Transcript from PDF
    const pdfPath = TRANSCRIPTION_MAP[nameKey];
    if (pdfPath && fs.existsSync(pdfPath)) {
      const transcript = extractPDFText(pdfPath);
      if (transcript) {
        await db.query(
          'INSERT INTO call_transcripts (call_id, tenant_id, translation_text) VALUES ($1,$2,$3)',
          [callId, TENANT_ID, transcript.trim()]
        );
      }
    } else {
      console.warn(`  ⚠️  No PDF mapped for: ${agentName}`);
    }

    inserted++;
  }

  await db.query(
    'UPDATE upload_batches SET total_calls=$1, status=$2, processed_at=NOW() WHERE id=$3',
    [inserted, 'done', batchId]
  );
  console.log(`\n[hbl-ingest] Ingested ${inserted} calls. Running AI insights...`);

  const ins = await processBatchInsights(TENANT_ID, batchId);
  console.log(`[hbl-ingest] Insights: ${ins.processed} ok, ${ins.errors} errors`);
  console.log('[hbl-ingest] Done.');
  process.exit(0);
}

run().catch(e => { console.error('[hbl-ingest] ERROR:', e.message); process.exit(1); });
