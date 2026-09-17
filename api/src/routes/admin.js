const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// GET /api/admin/tenants — list all orgs
router.get('/tenants', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        t.id, t.name, t.slug, t.industry, t.dashboard_mode, t.is_active, t.created_at,
        COUNT(DISTINCT u.id) AS user_count,
        COUNT(DISTINCT c.id) AS call_count
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN calls c ON c.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/tenants — create new org + admin user
router.post('/tenants', async (req, res) => {
  const { tenantName, industry, dashboard_mode, email, password } = req.body;
  if (!tenantName || !email || !password) return res.status(400).json({ error: 'Missing required fields: tenantName, email, password' });
  try {
    const slug = tenantName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const tenantRes = await db.query(
      'INSERT INTO tenants (name, slug, industry, dashboard_mode) VALUES ($1, $2, $3, $4) RETURNING id',
      [tenantName, slug, industry || 'generic', dashboard_mode || 'standard']
    );
    const tenantId = tenantRes.rows[0].id;
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
      [tenantId, email, hash, 'admin']
    );
    res.json({ message: 'Tenant created', tenantId, slug });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email or tenant slug already exists' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/tenants/:id — update org (industry, dashboard_mode, is_active)
router.patch('/tenants/:id', async (req, res) => {
  const { industry, dashboard_mode, is_active } = req.body;
  try {
    const fields = [];
    const values = [];
    let i = 1;
    if (industry !== undefined)       { fields.push(`industry = $${i++}`);       values.push(industry); }
    if (dashboard_mode !== undefined) { fields.push(`dashboard_mode = $${i++}`); values.push(dashboard_mode); }
    if (is_active !== undefined)      { fields.push(`is_active = $${i++}`);      values.push(is_active); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    values.push(req.params.id);
    await db.query(`UPDATE tenants SET ${fields.join(', ')} WHERE id = $${i}`, values);
    res.json({ message: 'Updated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/tenants/:id — hard delete org + all data
router.delete('/tenants/:id', async (req, res) => {
  try {
    // Cascade handled by FK constraints; delete tenant last
    await db.query('DELETE FROM tenants WHERE id = $1', [req.params.id]);
    res.json({ message: 'Tenant deleted' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
