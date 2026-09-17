const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Register tenant + admin user
router.post('/register', async (req, res) => {
  const { tenantName, industry, email, password } = req.body;
  if (!tenantName || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const tenantRes = await db.query(
      'INSERT INTO tenants (name, slug, industry) VALUES ($1, $2, $3) RETURNING id',
      [tenantName, slug, industry || 'generic']
    );
    const tenantId = tenantRes.rows[0].id;
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [tenantId, email, hash, 'admin']
    );
    res.json({ message: 'Tenant created', tenantId, slug });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or tenant already exists' });
    res.status(500).json({ error: e.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const userRes = await db.query(
      `SELECT u.*, t.name as tenant_name, t.slug, t.industry, t.dashboard_mode
       FROM users u JOIN tenants t ON u.tenant_id = t.id
       WHERE u.email = $1 AND u.is_active = true`,
      [email]
    );
    if (!userRes.rows.length) return res.status(401).json({ error: 'Invalid credentials' });
    const user = userRes.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Group user: has access to all portals in their group
    let groupData = null;
    if (user.group_id) {
      const grpRes = await db.query(
        `SELECT id, name, slug, industry FROM tenant_groups WHERE id=$1`, [user.group_id]
      );
      const portalsRes = await db.query(
        `SELECT id, name, portal_type, portal_order, insights_enabled,
                voice_app_username, voice_app_org_id
         FROM tenants WHERE group_id=$1 AND is_active=true ORDER BY portal_order`,
        [user.group_id]
      );
      groupData = { group: grpRes.rows[0], portals: portalsRes.rows };
    }

    const token = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
        tenantName: user.tenant_name,
        groupId: user.group_id || null,
        portalIds: groupData ? groupData.portals.map(p => p.id) : null,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        email: user.email,
        role: user.role,
        tenantName: groupData ? groupData.group.name : user.tenant_name,
        tenantSlug: groupData ? groupData.group.slug : user.slug,
        industry: user.industry,
        dashboard_mode: groupData ? 'group' : (user.dashboard_mode || 'standard'),
        groupId: user.group_id || null,
        portals: groupData ? groupData.portals : null,
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public: get tenant info by slug (for tenant-scoped login page)
router.get('/tenant/:slug', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT name, industry FROM tenants WHERE slug = $1',
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ name: rows[0].name, industry: rows[0].industry });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
