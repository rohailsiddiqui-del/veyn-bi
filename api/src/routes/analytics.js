const router = require('express').Router();
const db = require('../db');

// Validate that forTenant belongs to the user's group (live DB check — JWT may be stale)
async function resolveGroupTenant(user, forTenantId) {
  if (!user.groupId || !forTenantId) return null;
  const { rows } = await db.query(
    'SELECT id FROM tenants WHERE id=$1 AND group_id=$2 AND is_active=true',
    [forTenantId, user.groupId]
  );
  return rows.length ? forTenantId : null;
}

// KPI summary
router.get('/summary', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let where = 'WHERE tenant_id=$1';
    const params = [tenantId];
    if (from) { params.push(from); where += ` AND call_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        COUNT(*) AS total_calls,
        ROUND(AVG(score),2) AS avg_score,
        COUNT(*) FILTER (WHERE status='ERROR FREE') AS error_free,
        COUNT(*) FILTER (WHERE status='DEFICIENT') AS deficient,
        COUNT(*) FILTER (WHERE has_transcript=true) AS with_transcript,
        ROUND(AVG(call_duration_seconds)::numeric/60, 1) AS avg_duration_min,
        MIN(call_date) AS date_from,
        MAX(call_date) AS date_to
      FROM calls ${where}
    `, params);

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agent performance
router.get('/agents', async (req, res) => {
  let tenantId = req.user.tenantId;
  const resolved = await resolveGroupTenant(req.user, req.query.forTenant);
  if (resolved) tenantId = resolved;
  const { from, to } = req.query;

  try {
    let where = 'WHERE tenant_id=$1';
    const params = [tenantId];
    if (from) { params.push(from); where += ` AND call_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND call_date <= $${params.length}`; }

    const r = await db.query(`
      SELECT
        agent_name,
        COUNT(*) AS total_calls,
        ROUND(AVG(score),2) AS avg_score,
        ROUND(MIN(score),2) AS min_score,
        ROUND(MAX(score),2) AS max_score,
        COUNT(*) FILTER (WHERE status='ERROR FREE') AS error_free,
        COUNT(*) FILTER (WHERE status='DEFICIENT') AS deficient,
        ROUND(AVG(call_duration_seconds)::numeric/60,1) AS avg_duration_min
      FROM calls ${where}
      GROUP BY agent_name
      ORDER BY avg_score DESC
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agent coaching — failing parameters for a specific agent
router.get('/agents/:agentName/coaching', async (req, res) => {
  const { tenantId } = req.user;
  const { agentName } = req.params;
  const { from, to } = req.query;

  try {
    let callWhere = 'c.tenant_id=$1 AND c.agent_name=$2';
    const params = [tenantId, agentName];
    if (from) { params.push(from); callWhere += ` AND c.call_date >= $${params.length}`; }
    if (to)   { params.push(to);   callWhere += ` AND c.call_date <= $${params.length}`; }

    // Parameter breakdown for this agent
    const paramStats = await db.query(`
      SELECT
        p.param_name,
        COUNT(*) AS total,
        ROUND(AVG(p.score),2) AS avg_score,
        COUNT(*) FILTER (WHERE p.score = 0) AS zero_count,
        ROUND(COUNT(*) FILTER (WHERE p.score = 0)::numeric / COUNT(*) * 100, 1) AS zero_pct
      FROM call_param_scores p
      JOIN calls c ON p.call_id = c.id
      WHERE ${callWhere}
      GROUP BY p.param_name
      ORDER BY zero_pct DESC
    `, params);

    // Sample failing calls for the worst parameter
    let sampleCalls = [];
    if (paramStats.rows.length > 0) {
      const worstParam = paramStats.rows[0].param_name;
      const sampleParams = [tenantId, agentName, worstParam];
      const sampleRes = await db.query(`
        SELECT c.call_ref, c.call_date, c.score, p.score AS param_score
        FROM call_param_scores p
        JOIN calls c ON p.call_id = c.id
        WHERE c.tenant_id=$1 AND c.agent_name=$2 AND p.param_name=$3 AND p.score = 0
        ORDER BY c.call_date DESC
        LIMIT 5
      `, sampleParams);
      sampleCalls = sampleRes.rows;
    }

    res.json({ agentName, params: paramStats.rows, sampleCalls });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Hard delete all data for an agent
router.delete('/agents/:agentName', async (req, res) => {
  const { tenantId } = req.user;
  const { agentName } = req.params;

  try {
    // Get all call IDs for this agent in this tenant
    const callsRes = await db.query(
      'SELECT id FROM calls WHERE tenant_id=$1 AND agent_name=$2',
      [tenantId, agentName]
    );
    const callIds = callsRes.rows.map(r => r.id);

    if (callIds.length === 0) {
      return res.json({ deleted: 0, message: 'No calls found for this agent' });
    }

    // Delete in dependency order
    await db.query('DELETE FROM call_insights WHERE call_id = ANY($1)', [callIds]);
    await db.query('DELETE FROM call_transcripts WHERE call_id = ANY($1)', [callIds]);
    await db.query('DELETE FROM call_param_scores WHERE call_id = ANY($1)', [callIds]);
    await db.query('DELETE FROM calls WHERE id = ANY($1) AND tenant_id=$2', [callIds, tenantId]);

    res.json({ deleted: callIds.length, message: `Deleted ${callIds.length} calls for agent "${agentName}"` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Hard delete a single call by ID
router.delete('/calls/:callId', async (req, res) => {
  const { tenantId } = req.user;
  const { callId } = req.params;

  try {
    // Verify call belongs to this tenant
    const check = await db.query(
      'SELECT id FROM calls WHERE id=$1 AND tenant_id=$2',
      [callId, tenantId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Call not found' });

    await db.query('DELETE FROM call_insights WHERE call_id=$1', [callId]);
    await db.query('DELETE FROM call_transcripts WHERE call_id=$1', [callId]);
    await db.query('DELETE FROM call_param_scores WHERE call_id=$1', [callId]);
    await db.query('DELETE FROM calls WHERE id=$1 AND tenant_id=$2', [callId, tenantId]);

    res.json({ deleted: true, callId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Score trend (daily)
router.get('/trend', async (req, res) => {
  let tenantId = req.user.tenantId;
  const resolved = await resolveGroupTenant(req.user, req.query.forTenant);
  if (resolved) tenantId = resolved;
  const { from, to, agent } = req.query;

  try {
    let where = 'WHERE tenant_id=$1';
    const params = [tenantId];
    if (from)  { params.push(from);  where += ` AND call_date >= $${params.length}`; }
    if (to)    { params.push(to);    where += ` AND call_date <= $${params.length}`; }
    if (agent) { params.push(agent); where += ` AND agent_name = $${params.length}`; }

    const r = await db.query(`
      SELECT
        call_date AS date,
        COUNT(*) AS total_calls,
        ROUND(AVG(score),2) AS avg_score,
        COUNT(*) FILTER (WHERE status='ERROR FREE') AS error_free,
        COUNT(*) FILTER (WHERE status='DEFICIENT') AS deficient
      FROM calls ${where}
      GROUP BY call_date
      ORDER BY call_date
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Parameter weakness analysis
router.get('/params', async (req, res) => {
  let tenantId = req.user.tenantId;
  const resolved = await resolveGroupTenant(req.user, req.query.forTenant);
  if (resolved) tenantId = resolved;
  const { from, to, agent } = req.query;

  try {
    let callWhere = 'c.tenant_id=$1';
    const params = [tenantId];
    if (from)  { params.push(from);  callWhere += ` AND c.call_date >= $${params.length}`; }
    if (to)    { params.push(to);    callWhere += ` AND c.call_date <= $${params.length}`; }
    if (agent) { params.push(agent); callWhere += ` AND c.agent_name = $${params.length}`; }

    const r = await db.query(`
      SELECT
        p.param_name,
        COUNT(*) AS total,
        ROUND(AVG(p.score),2) AS avg_score,
        COUNT(*) FILTER (WHERE p.score = 0) AS zero_count,
        ROUND(COUNT(*) FILTER (WHERE p.score = 0)::numeric / COUNT(*) * 100, 1) AS zero_pct
      FROM call_param_scores p
      JOIN calls c ON p.call_id = c.id
      WHERE ${callWhere}
      GROUP BY p.param_name
      ORDER BY zero_pct DESC
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Score distribution bands
router.get('/distribution', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to } = req.query;

  try {
    let where = 'WHERE tenant_id=$1';
    const params = [tenantId];
    if (from) { params.push(from); where += ` AND call_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND call_date <= $${params.length}`; }

    const r = await db.query(`
      SELECT
        CASE
          WHEN score < 60 THEN 'Below 60'
          WHEN score < 70 THEN '60-69'
          WHEN score < 80 THEN '70-79'
          WHEN score < 90 THEN '80-89'
          WHEN score < 100 THEN '90-99'
          ELSE '100'
        END AS band,
        COUNT(*) AS count
      FROM calls ${where}
      GROUP BY band
      ORDER BY band
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/analytics/stores — list all stores for the authenticated tenant
router.get('/stores', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { rows } = await db.query(
      `SELECT store_id, store_name, city, address, contact, email, open_time, close_time, is_active
       FROM tenant_stores WHERE tenant_id = $1 ORDER BY city, store_name`,
      [tenantId]
    );
    res.json({ stores: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/analytics/branches — branch-level call stats
router.get('/branches', async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { rows } = await db.query(`
      SELECT
        c.branch_name,
        COUNT(c.id) AS total_calls,
        COUNT(ci.call_id) AS processed,
        ROUND(AVG(ci.customer_sentiment_score)::numeric, 2) AS avg_sentiment,
        COUNT(CASE WHEN ci.threat_detected THEN 1 END) AS threats,
        COUNT(CASE WHEN ci.escalation_request THEN 1 END) AS escalations,
        COUNT(CASE WHEN ci.call_outcome = 'Resolved' THEN 1 END) AS resolved
      FROM calls c
      LEFT JOIN call_insights ci ON ci.call_id = c.id
      WHERE c.tenant_id = $1
        AND c.branch_name IS NOT NULL AND c.branch_name != ''
      GROUP BY c.branch_name
      ORDER BY total_calls DESC
    `, [tenantId]);
    res.json({ branches: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
