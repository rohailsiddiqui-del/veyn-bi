const db = require('./api/src/db');
db.query('SELECT error, count(*) FROM call_insights WHERE error IS NOT NULL GROUP BY error')
  .then(r => {
    console.log(r.rows);
    process.exit(0);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
