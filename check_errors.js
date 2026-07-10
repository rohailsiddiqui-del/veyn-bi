const db = require('./src/db');
db.query('SELECT error, COUNT(*) FROM call_insights WHERE error IS NOT NULL GROUP BY error')
  .then(r => { console.log(r.rows); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
