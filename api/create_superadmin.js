// Run once on GCP to create the superadmin account:
//   node create_superadmin.js
require('dotenv').config({ path: __dirname + '/.env' });
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function main() {
  const email = process.env.SUPERADMIN_EMAIL || 'rohail@veyn.ai';
  const password = process.env.SUPERADMIN_PASSWORD || 'change_me_now';

  // Ensure a superadmin tenant exists (slug: veyn-admin)
  let tenantId;
  const existing = await pool.query("SELECT id FROM tenants WHERE slug = 'veyn-admin'");
  if (existing.rows.length) {
    tenantId = existing.rows[0].id;
    console.log('Using existing veyn-admin tenant, id:', tenantId);
  } else {
    const t = await pool.query(
      "INSERT INTO tenants (name, slug, industry, dashboard_mode) VALUES ('Veyn Admin', 'veyn-admin', 'generic', 'standard') RETURNING id"
    );
    tenantId = t.rows[0].id;
    console.log('Created veyn-admin tenant, id:', tenantId);
  }

  // Upsert superadmin user
  const hash = await bcrypt.hash(password, 10);
  const u = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (u.rows.length) {
    await pool.query(
      "UPDATE users SET password_hash = $1, role = 'superadmin', is_active = true WHERE email = $2",
      [hash, email]
    );
    console.log('Updated existing user to superadmin:', email);
  } else {
    await pool.query(
      "INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'superadmin')",
      [tenantId, email, hash]
    );
    console.log('Created superadmin user:', email);
  }

  console.log('Done. Login with:', email, '/', password);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
