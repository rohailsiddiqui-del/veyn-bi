const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/cases — overview stats for case-mode tenants
router.get('/', async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const stats = await pool.query(`
      SELECT
        COUNT(DISTINCT c.id) as total_cases,
        COUNT(ci.id) as total_interactions,
        ROUND(AVG(c.total_interactions), 2) as avg_interactions_per_case,
        COUNT(DISTINCT CASE WHEN c.total_interactions = 1 THEN c.id END) as single_interaction_cases,
        COUNT(DISTINCT CASE WHEN c.total_interactions > 1 THEN c.id END) as multi_interaction_cases,
        COUNT(DISTINCT ci.agent_name) as unique_agents
      FROM cases c
      JOIN case_interactions ci ON ci.case_id = c.id
      WHERE c.tenant_id = $1
    `, [tenantId]);

    // FCR rate (cases resolved in 1 interaction)
    const total = parseInt(stats.rows[0].total_cases) || 1;
    const single = parseInt(stats.rows[0].single_interaction_cases) || 0;
    const fcrRate = Math.round((single / total) * 100);

    // Channel breakdown
    const channels = await pool.query(`
      SELECT channel, COUNT(*) as count
      FROM case_interactions
      WHERE tenant_id = $1
      GROUP BY channel
    `, [tenantId]);

    // Score summary across all interactions
    const scores = await pool.query(`
      SELECT
        category,
        COUNT(CASE WHEN score = 'pass' THEN 1 END) as pass_count,
        COUNT(CASE WHEN score = 'fail' THEN 1 END) as fail_count,
        COUNT(CASE WHEN score = 'na' THEN 1 END) as na_count,
        COUNT(*) as total
      FROM case_interaction_scores
      WHERE tenant_id = $1
      GROUP BY category
      ORDER BY category
    `, [tenantId]);

    // Top failing subparameters
    const topFails = await pool.query(`
      SELECT subparameter, category,
        COUNT(CASE WHEN score = 'fail' THEN 1 END) as fail_count,
        COUNT(CASE WHEN score != 'na' THEN 1 END) as applicable,
        ROUND(COUNT(CASE WHEN score = 'fail' THEN 1 END)::numeric /
          NULLIF(COUNT(CASE WHEN score != 'na' THEN 1 END), 0) * 100, 1) as fail_rate
      FROM case_interaction_scores
      WHERE tenant_id = $1
      GROUP BY subparameter, category
      HAVING COUNT(CASE WHEN score = 'fail' THEN 1 END) > 0
      ORDER BY fail_count DESC
      LIMIT 10
    `, [tenantId]);

    res.json({
      stats: { ...stats.rows[0], fcr_rate: fcrRate },
      channels: channels.rows,
      categoryScores: scores.rows,
      topFailingSubparams: topFails.rows,
    });
  } catch (e) {
    console.error('Cases overview error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/list — paginated case list
router.get('/list', async (req, res) => {
  const tenantId = req.user.tenantId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  const search = req.query.search || '';

  try {
    const where = search
      ? `WHERE c.tenant_id = $1 AND c.case_number ILIKE $4`
      : `WHERE c.tenant_id = $1`;
    const params = search ? [tenantId, limit, offset, `%${search}%`] : [tenantId, limit, offset];

    const result = await pool.query(`
      SELECT
        c.id, c.case_number, c.total_interactions,
        MIN(ci.created_at) as first_contact,
        MAX(ci.created_at) as last_contact,
        array_agg(DISTINCT ci.channel) as channels,
        array_agg(DISTINCT ci.agent_name ORDER BY ci.agent_name) as agents,
        ROUND(
          COUNT(CASE WHEN cis.score = 'pass' THEN 1 END)::numeric /
          NULLIF(COUNT(CASE WHEN cis.score != 'na' THEN 1 END), 0) * 100
        , 1) as pass_rate
      FROM cases c
      JOIN case_interactions ci ON ci.case_id = c.id
      LEFT JOIN case_interaction_scores cis ON cis.interaction_id = ci.id
      ${where}
      GROUP BY c.id, c.case_number, c.total_interactions
      ORDER BY c.total_interactions DESC, c.case_number
      LIMIT $2 OFFSET $3
    `, params);

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM cases WHERE tenant_id = $1`, [tenantId]
    );

    res.json({
      cases: result.rows,
      total: parseInt(countRes.rows[0].count),
      page, limit,
    });
  } catch (e) {
    console.error('Cases list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/:caseNumber — full case trajectory
router.get('/:caseNumber', async (req, res) => {
  const tenantId = req.user.tenantId;
  const { caseNumber } = req.params;

  try {
    // Get case
    const caseRes = await pool.query(`
      SELECT * FROM cases WHERE tenant_id = $1 AND case_number = $2
    `, [tenantId, caseNumber]);
    if (!caseRes.rows.length) return res.status(404).json({ error: 'Case not found' });
    const caseData = caseRes.rows[0];

    // Get all interactions in order
    const interactions = await pool.query(`
      SELECT ci.*,
        json_agg(
          json_build_object(
            'category', cis.category,
            'subparameter', cis.subparameter,
            'score', cis.score
          ) ORDER BY cis.category, cis.subparameter
        ) as scores
      FROM case_interactions ci
      LEFT JOIN case_interaction_scores cis ON cis.interaction_id = ci.id
      WHERE ci.case_id = $1
      GROUP BY ci.id
      ORDER BY ci.interaction_order
    `, [caseData.id]);

    // Compute per-interaction summary score
    const interactionsWithSummary = interactions.rows.map(interaction => {
      const scores = interaction.scores || [];
      const applicable = scores.filter(s => s.score !== 'na');
      const passed = applicable.filter(s => s.score === 'pass');
      const passRate = applicable.length > 0
        ? Math.round((passed.length / applicable.length) * 100)
        : null;

      // Group scores by category
      const byCategory = {};
      for (const s of scores) {
        if (!byCategory[s.category]) byCategory[s.category] = { pass: 0, fail: 0, na: 0 };
        byCategory[s.category][s.score]++;
      }

      return { ...interaction, passRate, scoresByCategory: byCategory };
    });

    res.json({ case: caseData, interactions: interactionsWithSummary });
  } catch (e) {
    console.error('Case trajectory error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/agents/performance — agent-level stats
router.get('/agents/performance', async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const result = await pool.query(`
      SELECT
        ci.agent_name,
        COUNT(DISTINCT ci.case_id) as cases_handled,
        COUNT(DISTINCT ci.id) as total_interactions,
        array_agg(DISTINCT ci.channel) as channels,
        ROUND(
          COUNT(CASE WHEN cis.score = 'pass' THEN 1 END)::numeric /
          NULLIF(COUNT(CASE WHEN cis.score != 'na' THEN 1 END), 0) * 100
        , 1) as pass_rate,
        COUNT(CASE WHEN cis.score = 'fail' THEN 1 END) as total_fails
      FROM case_interactions ci
      LEFT JOIN case_interaction_scores cis ON cis.interaction_id = ci.id
      WHERE ci.tenant_id = $1
      GROUP BY ci.agent_name
      ORDER BY cases_handled DESC
    `, [tenantId]);

    res.json({ agents: result.rows });
  } catch (e) {
    console.error('Agent performance error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
