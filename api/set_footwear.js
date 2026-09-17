const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'veyn_bi',
  password: 'veyn_bi_2026',
  database: 'veyn_bi',
  port: 5432,
});
pool.query("UPDATE tenants SET industry='footwear' WHERE name ILIKE '%Logo Shoes%' RETURNING id, name, industry").then(res => {
  console.log('Updated:', res.rows);
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
