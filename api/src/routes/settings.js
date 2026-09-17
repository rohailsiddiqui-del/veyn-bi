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

// GET voice app API credentials
router.get('/api-credentials', async (req, res) => {
  const { tenantId } = req.user;
  try {
    const result = await db.query(
      `SELECT voice_app_username, voice_app_org_id,
              voice_app_eval_url, voice_app_trans_url, voice_app_trans_token
       FROM tenants WHERE id=$1`,
      [tenantId]
    );
    const row = result.rows[0] || {};
    res.json({
      username:   row.voice_app_username  || '',
      org_id:     row.voice_app_org_id    || '',
      eval_url:   row.voice_app_eval_url  || 'https://autovox-be.veyn.co.uk',
      trans_url:  row.voice_app_trans_url || 'https://autovox-translation-api.veyn.ai',
      trans_token: row.voice_app_trans_token || '',
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT save voice app API credentials
router.put('/api-credentials', async (req, res) => {
  const { tenantId } = req.user;
  const { username, password, org_id, eval_url, trans_url, trans_token } = req.body;
  try {
    await db.query(
      `UPDATE tenants SET
        voice_app_username=$1,
        voice_app_password=$2,
        voice_app_org_id=$3,
        voice_app_eval_url=$4,
        voice_app_trans_url=$5,
        voice_app_trans_token=$6
       WHERE id=$7`,
      [username || null, password || null, org_id || null,
       eval_url || 'https://autovox-be.veyn.co.uk',
       trans_url || 'https://autovox-translation-api.veyn.ai',
       trans_token || null, tenantId]
    );
    res.json({ message: 'API credentials saved' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
