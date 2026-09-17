require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool();
pool.query("UPDATE tenants SET industry='ecommerce' WHERE name ILIKE '%Logo Shoes%' RETURNING id, name, industry").then(res => {
  console.log('Updated tenants:', res.rows);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
