const db = require('./src/db');
db.query('SELECT COUNT(*) as c FROM call_insights WHERE call_category IS NOT NULL')
  .then(r => { console.log(r.rows[0].c, 'successfully processed'); process.exit(0); })
  .catch(e => { console.error(e); process.exit(1); });
