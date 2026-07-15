const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const multer = require('multer');
const XLSX = require('xlsx');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// POST /api/cases/upload — ingest XLSX eval + CSV transcripts for case-mode tenants
router.post('/upload', upload.fields([{ name: 'eval' }, { name: 'trans' }]), async (req, res) => {
  const tenantId = req.user.tenantId;
  const evalFile = req.files?.['eval']?.[0];
  const transFile = req.files?.['trans']?.[0];

  if (!evalFile) return res.status(400).json({ error: 'Evaluation file (XLSX or CSV) is required.' });

  try {
    // --- Parse transcripts CSV (optional) ---
    // Expected columns: Case Number, Agent Name, Channel, Transcript, Translation
    const transcriptMap = {};
    if (transFile) {
      const lines = transFile.buffer.toString('utf-8').split('\n');
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      const idx = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
      const caseIdx = idx('Case Number'), agentIdx = idx('Agent Name'), chanIdx = idx('Channel'),
            transIdx = idx('Transcript'), translIdx = idx('Translation');
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].match(/(".*?"|[^,]+)(?=,|$)/g);
        if (!row) continue;
        const clean = (v) => (v || '').replace(/^"|"$/g, '').trim();
        const caseNum = clean(row[caseIdx]);
        const agentName = clean(row[agentIdx]);
        const channel = clean(row[chanIdx]);
        if (!caseNum) continue;
        const key = `${caseNum}|${agentName}|${channel}`;
        transcriptMap[key] = { transcript: clean(row[transIdx]), translation: clean(row[translIdx]) };
      }
    }

    // --- Parse eval XLSX ---
    const wb = XLSX.read(evalFile.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) return res.status(400).json({ error: 'Evaluation file has no data rows.' });

    // Detect columns (case-insensitive)
    const sampleKeys = Object.keys(rows[0]).map(k => k.trim());
    const findKey = (...names) => sampleKeys.find(k => names.some(n => k.toLowerCase().includes(n.toLowerCase())));
    const caseCol    = findKey('case number', 'case_number', 'case no');
    const agentCol   = findKey('agent name', 'agent_name', 'agent');
    const chanCol    = findKey('channel');
    const catCol     = findKey('category');
    const subParCol  = findKey('subparameter', 'sub parameter', 'sub-parameter', 'parameter');
    const scoreCol   = findKey('score', 'result', 'grade');

    if (!caseCol || !subParCol || !scoreCol) {
      return res.status(400).json({
        error: `Could not detect required columns. Found: ${sampleKeys.join(', ')}. Need: Case Number, Subparameter, Score.`
      });
    }

    // Normalize score
    const normalizeScore = (v) => {
      const s = String(v).trim().toLowerCase();
      if (['pass', '1', 'yes', 'true', 'ok'].includes(s)) return 'pass';
      if (['fail', '0', 'no', 'false', 'ng', 'nok'].includes(s)) return 'fail';
      return 'na';
    };

    // Group rows by case number
    const caseMap = {};
    for (const row of rows) {
      const caseNum = String(row[caseCol] || '').trim();
      if (!caseNum) continue;
      if (!caseMap[caseNum]) caseMap[caseNum] = [];
      caseMap[caseNum].push(row);
    }

    const caseNumbers = Object.keys(caseMap);
    let casesInserted = 0, interactionsInserted = 0, scoresInserted = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const caseNum of caseNumbers) {
        const caseRows = caseMap[caseNum];

        // Group by agent+channel to form interactions
        const interactionMap = {};
        for (const row of caseRows) {
          const agent = agentCol ? String(row[agentCol] || '').trim() : '';
          const channel = chanCol ? String(row[chanCol] || '').trim().toLowerCase() : 'voice';
          const intKey = `${agent}|${channel}`;
          if (!interactionMap[intKey]) interactionMap[intKey] = { agent, channel, scores: [] };
          const category = catCol ? String(row[catCol] || '').trim() : 'General';
          const subparam = String(row[subParCol] || '').trim();
          const score = normalizeScore(row[scoreCol]);
          if (subparam) interactionMap[intKey].scores.push({ category, subparam, score });
        }

        const interactions = Object.values(interactionMap);
        const totalInteractions = interactions.length;

        // Upsert case
        const caseRes = await client.query(`
          INSERT INTO cases (tenant_id, case_number, total_interactions)
          VALUES ($1, $2, $3)
          ON CONFLICT (tenant_id, case_number) DO UPDATE
            SET total_interactions = EXCLUDED.total_interactions
          RETURNING id, (xmax = 0) AS inserted
        `, [tenantId, caseNum, totalInteractions]);
        const caseId = caseRes.rows[0].id;
        if (caseRes.rows[0].inserted) casesInserted++;

        // Delete existing interactions for this case (re-ingest = replace)
        await client.query(`DELETE FROM case_interactions WHERE case_id = $1`, [caseId]);

        let order = 1;
        for (const interaction of interactions) {
          const tKey = `${caseNum}|${interaction.agent}|${interaction.channel}`;
          const tData = transcriptMap[tKey] || {};

          const intRes = await client.query(`
            INSERT INTO case_interactions (tenant_id, case_id, case_number, interaction_order, agent_name, channel, transcript, translation)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
          `, [tenantId, caseId, caseNum, order++, interaction.agent, interaction.channel, tData.transcript || null, tData.translation || null]);
          const intId = intRes.rows[0].id;
          interactionsInserted++;

          for (const s of interaction.scores) {
            await client.query(`
              INSERT INTO case_interaction_scores (tenant_id, interaction_id, category, subparameter, score)
              VALUES ($1, $2, $3, $4, $5)
            `, [tenantId, intId, s.category, s.subparam, s.score]);
            scoresInserted++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({
      message: `Ingested successfully.`,
      cases: caseNumbers.length,
      casesInserted,
      interactions: interactionsInserted,
      scores: scoresInserted,
    });

  } catch (e) {
    console.error('Cases upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

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
