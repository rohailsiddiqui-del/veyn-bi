const router = require('express').Router();
const db = require('../db');

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
  const { tenantId } = req.user;
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

// Score trend (daily)
router.get('/trend', async (req, res) => {
  const { tenantId } = req.user;
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
  const { tenantId } = req.user;
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

module.exports = router;
