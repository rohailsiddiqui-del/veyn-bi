require('dotenv').config();
const fs = require('fs');
const db = require('./src/db');
const { ingestCSVs } = require('./src/services/ingest');

const TENANT_ID = 'de3c8b2a-7d77-4313-99b5-1b39ed0a7725';
const EVAL_FILE = '/home/simplyrms/UBL/Data_20260805_215134_09_51 PM.csv';
const TRANS_FILE = '/home/simplyrms/UBL/UBL (2).csv';

async function run() {
  const evalText = fs.readFileSync(EVAL_FILE, 'utf-8');
  const transText = fs.readFileSync(TRANS_FILE, 'utf-8');

  const batchRes = await db.query(
    `INSERT INTO upload_batches (tenant_id, batch_name, eval_filename, trans_filename, status)
     VALUES ($1, $2, $3, $4, 'processing') RETURNING id`,
    [TENANT_ID, 'UBL Pilot Batch - Aug 2026', 'Data_20260805.csv', 'UBL (2).csv']
  );
  const batchId = batchRes.rows[0].id;
  console.log('Batch ID:', batchId);

  const result = await ingestCSVs(TENANT_ID, batchId, evalText, transText, 'inbound');
  console.log(`Ingested: ${result.inserted} calls`);
  if (result.errors?.length) console.log('Errors:', result.errors.slice(0, 5));

  if (result.inserted > 0) {
    console.log('Running AI insights...');
    const { processBatchInsights } = require('./src/services/insights');
    const ins = await processBatchInsights(TENANT_ID, batchId);
    console.log(`Insights: ${ins.processed} ok, ${ins.errors} errors`);
  }

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
