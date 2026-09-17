const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'veyn_bi',
  password: 'veyn_bi_2026',
  database: 'veyn_bi',
  port: 5432,
});
pool.query(`
  UPDATE call_insights
  SET error = NULL
  WHERE tenant_id = '64030e24-df62-4357-ab0c-087ece964daf' AND error IS NOT NULL
`).then(res => {
  console.log(`Cleared errors for ${res.rowCount} calls`);
  process.exit(0);
}).catch(console.error);
