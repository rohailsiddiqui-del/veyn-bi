const router = require('express').Router();
const db = require('../db');
const { sendBatchAlerts } = require('../services/alerts');

// GET current alert settings for the tenant
router.get('/alerts', async (req, res) => {
  const { tenantId } = req.user;
  try {
    const result = await db.query(
      'SELECT alert_email, alert_signals, alerts_enabled FROM tenants WHERE id=$1',
      [tenantId]
    );
    const row = result.rows[0] || {};
    res.json({
      alert_email: row.alert_email || '',
      alert_signals: row.alert_signals || ['threat', 'escalation'],
      alerts_enabled: row.alerts_enabled || false
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update alert settings
router.put('/alerts', async (req, res) => {
  const { tenantId } = req.user;
  const { alert_email, alert_signals, alerts_enabled } = req.body;

  try {
    await db.query(
      `UPDATE tenants
       SET alert_email=$1, alert_signals=$2, alerts_enabled=$3
       WHERE id=$4`,
      [
        alert_email || null,
        alert_signals || ['threat', 'escalation'],
        alerts_enabled === true || alerts_enabled === 'true',
        tenantId
      ]
    );
    res.json({ message: 'Alert settings saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST test alert — sends a real email with current flagged calls
router.post('/alerts/test', async (req, res) => {
  const { tenantId } = req.user;
  try {
    await sendBatchAlerts(tenantId, null, 'Test Alert');
    res.json({ message: 'Test alert sent — check your inbox' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
