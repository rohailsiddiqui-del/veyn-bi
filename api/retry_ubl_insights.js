require('dotenv').config();
const db = require('./src/db');
const { processBatchInsights } = require('./src/services/insights');

const TENANT_ID = 'de3c8b2a-7d77-4313-99b5-1b39ed0a7725';
const BATCH_ID = '57817cc5-cf7f-4f21-8e0a-f4293dac80f9';

async function run() {
  const before = await db.query(
    `SELECT COUNT(*) FROM call_insights WHERE call_id IN (SELECT id FROM calls WHERE tenant_id = $1)`,
    [TENANT_ID]
  );
  console.log(`Insights before: ${before.rows[0].count}`);

  console.log('Retrying missing insights (concurrency=3)...');
  const result = await processBatchInsights(TENANT_ID, BATCH_ID, 3);
  console.log(`Done: ${result.processed} ok, ${result.errors} errors, ${result.total} total attempted`);

  const after = await db.query(
    `SELECT COUNT(*) FROM call_insights WHERE call_id IN (SELECT id FROM calls WHERE tenant_id = $1)`,
    [TENANT_ID]
  );
  console.log(`Insights after: ${after.rows[0].count}`);

  process.exit(0);
}

run().catch(e => { console.error(e.message); process.exit(1); });
