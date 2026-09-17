require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./src/db');

async function setup() {
  // Get group
  const grp = await db.query("SELECT id FROM tenant_groups WHERE slug='dominos'");
  const groupId = grp.rows[0].id;
  console.log('Group ID:', groupId);

  // Get portals
  const portals = await db.query(
    "SELECT id, name, portal_type FROM tenants WHERE group_id=$1 ORDER BY portal_order",
    [groupId]
  );
  portals.rows.forEach(r => console.log(`Portal: ${r.portal_type} → ${r.id}`));

  // Create group admin user
  const hash = await bcrypt.hash('Dominos@2026', 10);

  // Use first portal's tenant_id as the "home" tenant (required FK), but group_id gives access to all
  const firstPortalId = portals.rows[0].id;

  await db.query(`
    INSERT INTO users (tenant_id, group_id, email, password_hash, role)
    VALUES ($1, $2, $3, $4, 'admin')
    ON CONFLICT (email) DO UPDATE SET group_id=$2, password_hash=$4
  `, [firstPortalId, groupId, 'admin@dominos.com', hash]);

  console.log('Created user: admin@dominos.com / Dominos@2026');
  process.exit(0);
}
setup().catch(e => { console.error(e); process.exit(1); });
