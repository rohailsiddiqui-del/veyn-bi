#!/bin/bash
cd ~/veyn-bi/api

node -e "
const db = require('./src/db');
db.query('DELETE FROM call_insights WHERE call_category IS NULL')
  .then(r => { console.log('Deleted', r.rowCount, 'incomplete rows'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
