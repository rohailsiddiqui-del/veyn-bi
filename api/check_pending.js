const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'veyn_bi',
  password: 'veyn_bi_2026',
  database: 'veyn_bi',
  port: 5432,
});
pool.query(`
  SELECT c.id, c.call_ref, ci.error
  FROM calls c
  LEFT JOIN call_insights ci ON ci.call_id = c.id
  WHERE c.tenant_id = '64030e24-df62-4357-ab0c-087ece964daf' AND (ci.call_id IS NULL OR ci.error IS NOT NULL)
  LIMIT 5
`).then(res => {
  console.log('Pending/Error calls:', res.rows);
  process.exit(0);
}).catch(console.error);
