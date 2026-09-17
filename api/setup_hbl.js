require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/db');

async function setup() {
  const grp = await db.query("SELECT id FROM tenant_groups WHERE slug='hbl'");
  if (!grp.rows.length) { console.error('HBL group not found — run migrate_hbl.sql first'); process.exit(1); }
  const groupId = grp.rows[0].id;
  console.log('Group ID:', groupId);

  const portal = await db.query("SELECT id, name FROM tenants WHERE group_id=$1 ORDER BY portal_order", [groupId]);
  portal.rows.forEach(r => console.log(`Portal: ${r.name} → ${r.id}`));

  const tenantId = portal.rows[0].id;
  const hash = await bcrypt.hash('HBL@Pilot2026', 10);

  await db.query(`
    INSERT INTO users (tenant_id, group_id, email, password_hash, role)
    VALUES ($1, $2, $3, $4, 'admin')
    ON CONFLICT (email) DO UPDATE SET group_id=$2, password_hash=$4
  `, [tenantId, groupId, 'admin@hbl.com', hash]);

  console.log('Created user: admin@hbl.com / HBL@Pilot2026');
  console.log('Tenant ID (for ingest):', tenantId);
  process.exit(0);
}
setup().catch(e => { console.error(e); process.exit(1); });
