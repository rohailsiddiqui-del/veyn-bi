const db = require('./src/db');

async function check() {
  try {
    const res = await db.query(`
      SELECT c.call_date::date, ci.error, count(*)
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id
      WHERE ci.error IS NOT NULL
      GROUP BY c.call_date::date, ci.error
      ORDER BY c.call_date::date DESC;
    `);
    console.log(res.rows);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
check();
