const router = require('express').Router();
const multer = require('multer');
const db = require('../db');
const { ingestCSVs } = require('../services/ingest');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Live DB check — JWT portalIds may be stale if portals were added after login
async function resolveGroupPortal(groupId, portalTenantId) {
  if (!groupId || !portalTenantId) return null;
  const { rows } = await db.query(
    'SELECT id FROM tenants WHERE id=$1 AND group_id=$2 AND is_active=true',
    [portalTenantId, groupId]
  );
  return rows.length ? portalTenantId : null;
}

async function getLiveGroupPortalIds(groupId) {
  const { rows } = await db.query(
    'SELECT id FROM tenants WHERE group_id=$1 AND is_active=true ORDER BY portal_order',
    [groupId]
  );
  return rows.map(r => r.id);
}

// Upload eval + transcript CSVs
router.post('/', upload.fields([{ name: 'eval' }, { name: 'trans' }]), async (req, res) => {
  // Group users can target a specific portal — live DB check, not stale JWT
  let tenantId = req.user.tenantId;
  if (req.user.groupId && req.body.portalTenantId) {
    const resolved = await resolveGroupPortal(req.user.groupId, req.body.portalTenantId);
    if (resolved) tenantId = resolved;
  }
  const batchName = req.body.batchName || `Batch ${new Date().toISOString().slice(0,10)}`;
  const direction = ['inbound','outbound','mixed'].includes(req.body.direction) ? req.body.direction : 'inbound';

  try {
    const evalFile = req.files['eval']?.[0];
    const transFile = req.files['trans']?.[0];

    if (!evalFile) return res.status(400).json({ error: 'Eval CSV is required' });

    const batchRes = await db.query(
      `INSERT INTO upload_batches (tenant_id, batch_name, eval_filename, trans_filename, status)
       VALUES ($1,$2,$3,$4,'processing') RETURNING id`,
      [tenantId, batchName, evalFile.originalname, transFile?.originalname || null]
    );
    const batchId = batchRes.rows[0].id;

    const evalText = evalFile.buffer.toString('utf-8');
    const transText = transFile ? transFile.buffer.toString('utf-8') : null;

    // Run ingestion async, respond immediately
    res.json({ message: 'Upload received, processing...', batchId });

    ingestCSVs(tenantId, batchId, evalText, transText, direction)
      .then(result => {
        console.log(`Batch ${batchId}: ${result.inserted} calls ingested`);
        if (result.inserted > 0) {
          const { processBatchInsights } = require('../services/insights');
          processBatchInsights(tenantId, batchId)
            .then(r => console.log(`Auto-insights ${batchId}: ${r.processed} ok, ${r.errors} errors`))
            .catch(e => console.error(`Auto-insights ${batchId} error:`, e.message));
        }
      })
      .catch(e => {
        console.error(`Batch ${batchId} error:`, e.message);
        db.query('UPDATE upload_batches SET status=$1 WHERE id=$2', ['error', batchId]);
      });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pull eval + translation CSVs from Voice App API and ingest
router.post('/pull-from-api', async (req, res) => {
  let tenantId = req.user.tenantId;
  const { date_from, date_to, direction, batch_name, portal_tenant_id } = req.body;
  if (req.user.groupId && portal_tenant_id) {
    const resolved = await resolveGroupPortal(req.user.groupId, portal_tenant_id);
    if (resolved) tenantId = resolved;
  }

  if (!date_from || !date_to) return res.status(400).json({ error: 'date_from and date_to are required' });

  // Load credentials from tenant row
  let creds;
  try {
    const result = await db.query(
      `SELECT voice_app_username, voice_app_password, voice_app_org_id,
              voice_app_eval_url, voice_app_trans_url, voice_app_trans_token
       FROM tenants WHERE id=$1`,
      [tenantId]
    );
    creds = result.rows[0];
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load API credentials: ' + e.message });
  }

  if (!creds?.voice_app_username || !creds?.voice_app_password) {
    return res.status(400).json({ error: 'Voice App API credentials not configured. Go to Settings → API Credentials.' });
  }

  const evalBaseUrl  = creds.voice_app_eval_url  || 'https://autovox-be.veyn.co.uk';
  const transBaseUrl = creds.voice_app_trans_url || 'https://autovox-translation-api.veyn.ai';
  const transToken   = creds.voice_app_trans_token || '';
  const range = `${date_from}/${date_to}`;

  try {
    // 1. Login to Voice App
    const loginRes = await fetch(`${evalBaseUrl}/rbac/auth-user/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: creds.voice_app_username, password: creds.voice_app_password }),
    });
    if (!loginRes.ok) return res.status(400).json({ error: `Voice App login failed: HTTP ${loginRes.status}` });
    const loginData = await loginRes.json();
    const voiceToken = loginData?.data?.access;
    const orgId = creds.voice_app_org_id || loginData?.data?.org_id;
    if (!voiceToken) return res.status(400).json({ error: 'No access token from Voice App login' });

    // 2. Fetch Eval CSV
    const evalRes = await fetch(`${evalBaseUrl}/core/call-evaluation/evaluation_list/?download=1&key=duration&order=desc&date_range=${range}`, {
      headers: { Authorization: `Bearer ${voiceToken}` },
    });
    if (!evalRes.ok) return res.status(400).json({ error: `Eval fetch failed: HTTP ${evalRes.status}` });
    const evalText = await evalRes.text();
    const evalRows = evalText.trim().split('\n').length - 1;

    // 3. Fetch Translation CSV
    let transText = null;
    if (orgId) {
      const transRes = await fetch(`${transBaseUrl}/get_all_translations?date_range=${range}&org_id=${orgId}`, {
        headers: { Authorization: `Bearer ${transToken}` },
      });
      if (transRes.ok) transText = await transRes.text();
    }

    if (evalRows === 0) return res.status(200).json({ message: 'No calls found for this date range', evalRows: 0 });

    // 4. Create batch and ingest
    const batchNameFinal = batch_name || `API Pull ${range}`;
    const callDir = ['inbound','outbound','mixed'].includes(direction) ? direction : 'inbound';

    const batchRes = await db.query(
      `INSERT INTO upload_batches (tenant_id, batch_name, eval_filename, trans_filename, status, source)
       VALUES ($1,$2,$3,$4,'processing','api') RETURNING id`,
      [tenantId, batchNameFinal, `api-eval-${range}.csv`, transText ? `api-trans-${range}.csv` : null]
    );
    const batchId = batchRes.rows[0].id;

    res.json({ message: `Fetched ${evalRows} calls from API, processing...`, batchId, evalRows });

    const { ingestCSVs } = require('../services/ingest');
    ingestCSVs(tenantId, batchId, evalText, transText, callDir)
      .then(r => {
        console.log(`API pull batch ${batchId}: ${r.inserted} calls ingested`);
        if (r.inserted > 0) {
          const { processBatchInsights } = require('../services/insights');
          processBatchInsights(tenantId, batchId)
            .then(res => console.log(`Auto-insights API pull ${batchId}: ${res.processed} ok, ${res.errors} errors`))
            .catch(e => console.error(`Auto-insights API pull ${batchId} error:`, e.message));
        }
      })
      .catch(e => {
        console.error(`API pull batch ${batchId} error:`, e.message);
        db.query('UPDATE upload_batches SET status=$1 WHERE id=$2', ['error', batchId]);
      });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get batch status
router.get('/batches', async (req, res) => {
  try {
    // Group users see batches across all portals — live DB query, not stale JWT
    const tenantIds = req.user.groupId
      ? await getLiveGroupPortalIds(req.user.groupId)
      : [req.user.tenantId];
    const result = await db.query(
      `SELECT b.*, t.name AS portal_name, t.portal_type
       FROM upload_batches b
       LEFT JOIN tenants t ON t.id = b.tenant_id
       WHERE b.tenant_id = ANY($1::uuid[])
       ORDER BY b.created_at DESC LIMIT 50`,
      [tenantIds]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/batches/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM upload_batches WHERE id=$1 AND tenant_id=$2',
      [req.params.id, req.user.tenantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Batch not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
