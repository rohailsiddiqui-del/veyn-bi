require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool();
pool.query('SELECT AVG(customer_sentiment_score) as raw, ROUND(AVG(customer_sentiment_score)::numeric,2) as rnd FROM call_insights WHERE tenant_id=64').then(res => { console.log(res.rows); process.exit(0); }).catch(console.error);
