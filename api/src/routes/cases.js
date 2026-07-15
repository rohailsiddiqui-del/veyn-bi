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

    // --- Parse eval XLSX (two-row header: row0=categories, row1=subparams, row2+=data) ---
    const wb = XLSX.read(evalFile.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const range = XLSX.utils.decode_range(ws['!ref']);
    const cellVal = (r, c) => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; return cell ? String(cell.v || '').trim() : ''; };

    // Read header rows
    const row0 = [], row1 = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row0.push(cellVal(range.s.r, c));
      row1.push(cellVal(range.s.r + 1, c));
    }

    // Determine if this is a two-row header sheet (row1 has subparam text in score columns)
    // vs a flat sheet (row0 has all column names)
    const isTwoRowHeader = row1.some(v => (v.length > 10 && v.toLowerCase().includes('agent')) || v.toLowerCase().startsWith('did ') || v.toLowerCase().startsWith('was '));

    let caseColIdx = -1, agentColIdx = -1, chanColIdx = -1;
    const scoreColMap = []; // [{ colIdx, category, subparam }]

    if (isTwoRowHeader) {
      // Find fixed columns by row0 header
      caseColIdx  = row0.findIndex(v => v.toLowerCase().includes('case'));
      agentColIdx = row0.findIndex(v => v.toLowerCase().includes('agent'));
      chanColIdx  = row0.findIndex(v => v.toLowerCase().includes('channel'));

      // Build category carry-forward
      let currentCat = '';
      for (let c = range.s.c; c <= range.e.c; c++) {
        const ci = c - range.s.c;
        if (row0[ci]) currentCat = row0[ci];
        const subparam = row1[ci];
        // Only score columns: not the fixed meta columns and subparam has real text
        if (ci !== caseColIdx && ci !== agentColIdx && ci !== chanColIdx && subparam) {
          scoreColMap.push({ colIdx: ci, category: currentCat, subparam });
        }
      }
    }

    // Normalize score value
    const normalizeScore = (v) => {
      const s = String(v || '').trim().toLowerCase();
      if (['pass', '1', 'yes', 'true', 'ok'].includes(s)) return 'pass';
      if (['fail', '0', 'no', 'false', 'ng', 'nok'].includes(s)) return 'fail';
      return 'na';
    };

    // Parse data rows (start from row 2 for two-row header, row 1 for flat)
    const dataStartRow = isTwoRowHeader ? range.s.r + 2 : range.s.r + 1;

    // Group rows by case number
    const caseMap = {};

    if (isTwoRowHeader) {
      for (let r = dataStartRow; r <= range.e.r; r++) {
        const caseNum = cellVal(r, range.s.c + caseColIdx);
        if (!caseNum) continue;
        const agent   = agentColIdx >= 0 ? cellVal(r, range.s.c + agentColIdx) : '';
        const channel = chanColIdx  >= 0 ? cellVal(r, range.s.c + chanColIdx).toLowerCase() : 'voice';
        const scores  = scoreColMap.map(({ colIdx, category, subparam }) => ({
          category,
          subparam,
          score: normalizeScore(cellVal(r, range.s.c + colIdx)),
        }));
        if (!caseMap[caseNum]) caseMap[caseNum] = [];
        caseMap[caseNum].push({ agent, channel, scores });
      }
    } else {
      // Flat format fallback: use sheet_to_json
      const flatRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (!flatRows.length) return res.status(400).json({ error: 'Evaluation file has no data rows.' });
      const sampleKeys = Object.keys(flatRows[0]).map(k => k.trim());
      const findKey = (...names) => sampleKeys.find(k => names.some(n => k.toLowerCase().includes(n.toLowerCase())));
      const caseKey   = findKey('case number', 'case_number', 'case no');
      const agentKey  = findKey('agent name', 'agent_name', 'agent');
      const chanKey   = findKey('channel');
      const catKey    = findKey('category');
      const subKey    = findKey('subparameter', 'sub parameter', 'parameter');
      const scoreKey  = findKey('score', 'result', 'grade');
      if (!caseKey || !subKey || !scoreKey) {
        return res.status(400).json({ error: `Cannot detect columns. Found: ${sampleKeys.join(', ')}` });
      }
      for (const row of flatRows) {
        const caseNum = String(row[caseKey] || '').trim();
        if (!caseNum) continue;
        const agent   = String(row[agentKey] || '').trim();
        const channel = String(row[chanKey]  || '').trim().toLowerCase() || 'voice';
        const category= String(row[catKey]   || '').trim() || 'General';
        const subparam= String(row[subKey]   || '').trim();
        const score   = normalizeScore(row[scoreKey]);
        if (!subparam) continue;
        if (!caseMap[caseNum]) caseMap[caseNum] = [];
        caseMap[caseNum].push({ agent, channel, scores: [{ category, subparam, score }] });
      }
    }

    const caseNumbers = Object.keys(caseMap);
    if (!caseNumbers.length) return res.status(400).json({ error: 'No valid cases found in the file.' });

    let casesInserted = 0, interactionsInserted = 0, scoresInserted = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const caseNum of caseNumbers) {
        const caseRows = caseMap[caseNum];

        // Group by agent+channel to form interactions
        const interactionMap = {};
        for (const row of caseRows) {
          const intKey = `${row.agent}|${row.channel}`;
          if (!interactionMap[intKey]) interactionMap[intKey] = { agent: row.agent, channel: row.channel, scores: [] };
          // For two-row header each row already has all scores; for flat each row has one score
          interactionMap[intKey].scores.push(...row.scores);
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

// GET /api/cases/insights/interaction/:interactionId — full detail for expanded row
router.get('/insights/interaction/:interactionId', async (req, res) => {
  const tenantId = req.user.tenantId;
  const { interactionId } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        ci.id, ci.case_number, ci.agent_name, ci.channel,
        ci.transcript, ci.translation,
        cins.call_category, cins.call_subcategory, cins.call_outcome,
        cins.customer_sentiment_overall, cins.customer_sentiment_score,
        cins.agent_sentiment_overall,
        cins.threat_detected, cins.threat_details,
        cins.social_media_mention, cins.social_media_details,
        cins.escalation_request, cins.escalation_details,
        cins.regulatory_mention, cins.regulatory_details,
        cins.top_complaints, cins.key_moments,
        cins.location_mentioned, cins.summary
      FROM case_interactions ci
      LEFT JOIN case_insights cins ON cins.interaction_id = ci.id
      WHERE ci.tenant_id = $1 AND ci.id = $2
    `, [tenantId, interactionId]);

    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cases/insights/process — run AI on case interaction translations
router.post('/insights/process', async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const pending = await pool.query(`
      SELECT ci.id, ci.case_number, ci.agent_name, ci.channel, ci.translation, ci.transcript
      FROM case_interactions ci
      LEFT JOIN case_insights cins ON cins.interaction_id = ci.id AND cins.error IS NULL
      WHERE ci.tenant_id = $1 AND cins.id IS NULL
        AND (ci.translation IS NOT NULL AND length(ci.translation) > 50
             OR ci.transcript IS NOT NULL AND length(ci.transcript) > 50)
    `, [tenantId]);

    if (!pending.rows.length) {
      return res.json({ message: 'No unprocessed interactions found.', pending: 0 });
    }

    res.json({ message: `Processing ${pending.rows.length} interactions in background.`, pending: pending.rows.length });

    const { extractInsights } = require('../services/insights');

    for (const row of pending.rows) {
      try {
        const text = row.translation || row.transcript;
        const result = await extractInsights(text, 'travel');
        if (!result) continue;

        const sig = result.signal_intelligence || {};
        await pool.query(`
          INSERT INTO case_insights (
            tenant_id, case_id, interaction_id,
            call_category, call_subcategory, call_outcome,
            customer_sentiment_overall, customer_sentiment_score,
            agent_sentiment_overall, agent_sentiment_score,
            threat_detected, threat_details,
            social_media_mention, social_media_details,
            escalation_request, escalation_details,
            regulatory_mention, regulatory_details,
            top_complaints, key_moments, product_mentions,
            location_mentioned, customer_talk_pct, summary, error
          )
          SELECT $1, c.id, $2,
            $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NULL
          FROM cases c
          JOIN case_interactions ci ON ci.id = $2
          WHERE c.id = ci.case_id
          ON CONFLICT (interaction_id) DO UPDATE SET
            call_category=$3, call_subcategory=$4, call_outcome=$5,
            customer_sentiment_overall=$6, customer_sentiment_score=$7,
            agent_sentiment_overall=$8, agent_sentiment_score=$9,
            threat_detected=$10, threat_details=$11,
            social_media_mention=$12, social_media_details=$13,
            escalation_request=$14, escalation_details=$15,
            regulatory_mention=$16, regulatory_details=$17,
            top_complaints=$18, key_moments=$19, product_mentions=$20,
            location_mentioned=$21, customer_talk_pct=$22, summary=$23, error=NULL
        `, [
          tenantId, row.id,
          result.call_category || null,
          result.call_subcategory || null,
          result.call_outcome || null,
          result.customer_sentiment?.overall || null,
          result.customer_sentiment?.score != null ? Math.round((result.customer_sentiment.score + 1) * 50) : null,
          result.agent_sentiment?.overall || null,
          result.agent_sentiment?.score != null ? Math.round((result.agent_sentiment.score + 1) * 50) : null,
          sig.threat_detected || false,
          sig.threat_details || null,
          sig.social_media_mention || false,
          sig.social_media_details || null,
          sig.escalation_request || false,
          sig.escalation_details || null,
          sig.regulatory_mention || false,
          sig.regulatory_details || null,
          JSON.stringify(result.top_complaints || []),
          JSON.stringify(result.key_moments || []),
          JSON.stringify(result.product_mentions || []),
          result.location_mentioned || null,
          result.talk_time?.customer_pct || null,
          result.summary || null,
        ]);
      } catch (e) {
        console.error(`Case insight error interaction ${row.id}:`, e.message);
        await pool.query(`
          INSERT INTO case_insights (tenant_id, case_id, interaction_id, error)
          SELECT $1, c.id, $2, $3
          FROM cases c JOIN case_interactions ci ON ci.id = $2 WHERE c.id = ci.case_id
          ON CONFLICT DO NOTHING
        `, [tenantId, row.id, e.message]);
      }
    }
    console.log(`Case insights done tenant=${tenantId}: ${pending.rows.length} processed`);

  } catch (e) {
    console.error('Cases insights process error:', e);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/insights/all — same shape as /api/insights/all but from case tables
// Supports ?channel=voice|whatsapp to filter by interaction channel
router.get('/insights/all', async (req, res) => {
  const tenantId = req.user.tenantId;
  const channel = req.query.channel ? req.query.channel.toLowerCase() : null;

  // All queries join case_interactions (ci), so we filter on LOWER(ci.channel)
  const chanClause = channel ? `AND LOWER(ci.channel) = $2` : '';

  const params1 = channel ? [tenantId, channel] : [tenantId];

  try {
    const [summary, categories, signals, complaints, moments, sentimentByAgent, productTypes] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(DISTINCT ci.id) AS total_analysed,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.error IS NULL) AS success_count,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.threat_detected=true) AS threat_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.social_media_mention=true) AS social_media_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.escalation_request=true) AS escalation_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.regulatory_mention=true) AS regulatory_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.customer_sentiment_overall='Positive') AS positive_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.customer_sentiment_overall='Negative') AS negative_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.customer_sentiment_overall='Neutral') AS neutral_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.customer_sentiment_overall='Mixed') AS mixed_calls,
          ROUND(AVG(cins.customer_sentiment_score)::numeric,2) AS avg_customer_sentiment,
          ROUND(AVG(cins.agent_sentiment_score)::numeric,2) AS avg_agent_sentiment,
          ROUND(AVG(cins.customer_talk_pct)::numeric,1) AS avg_customer_talk_pct,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.call_outcome='Resolved') AS resolved_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.call_outcome='Unresolved') AS unresolved_calls,
          COUNT(DISTINCT cins.id) FILTER (WHERE cins.call_outcome='Escalated') AS escalated_calls
        FROM case_interactions ci
        LEFT JOIN case_insights cins ON cins.interaction_id = ci.id
        WHERE ci.tenant_id=$1 ${chanClause}
      `, params1),

      pool.query(`
        SELECT cins.call_category, cins.call_subcategory, COUNT(*) AS count,
          ROUND(AVG(cins.customer_sentiment_score)::numeric,2) AS avg_sentiment
        FROM case_insights cins
        JOIN case_interactions ci ON ci.id = cins.interaction_id
        WHERE cins.tenant_id=$1 AND cins.call_category IS NOT NULL ${chanClause}
        GROUP BY cins.call_category, cins.call_subcategory ORDER BY count DESC
      `, params1),

      pool.query(`
        SELECT
          ci.id AS call_id, ci.case_number AS call_ref, ci.agent_name, ci.created_at AS call_date,
          ci.channel,
          cins.call_category, cins.call_outcome,
          cins.threat_detected, cins.threat_details,
          cins.social_media_mention, cins.social_media_details,
          cins.escalation_request, cins.escalation_details,
          cins.regulatory_mention, cins.regulatory_details,
          cins.customer_sentiment_overall, cins.summary, cins.key_moments
        FROM case_insights cins
        JOIN case_interactions ci ON ci.id = cins.interaction_id
        WHERE cins.tenant_id=$1
          AND (cins.threat_detected=true OR cins.social_media_mention=true
               OR cins.escalation_request=true OR cins.regulatory_mention=true)
          ${chanClause}
        ORDER BY ci.created_at DESC LIMIT 100
      `, params1),

      pool.query(`
        SELECT
          CASE
            WHEN cins.call_subcategory ILIKE '%refund%' OR cins.call_subcategory ILIKE '%cancel%' THEN 'Refund / Cancellation'
            WHEN cins.call_subcategory ILIKE '%modif%' OR cins.call_subcategory ILIKE '%change%' OR cins.call_subcategory ILIKE '%amend%' OR cins.call_subcategory ILIKE '%date change%' THEN 'Booking Modification'
            WHEN cins.call_subcategory ILIKE '%baggage%' OR cins.call_subcategory ILIKE '%luggage%' THEN 'Baggage'
            WHEN cins.call_subcategory ILIKE '%hotel%' THEN 'Hotel Issue'
            WHEN cins.call_subcategory ILIKE '%boarding%' OR cins.call_subcategory ILIKE '%check-in%' OR cins.call_subcategory ILIKE '%check in%' THEN 'Check-in / Boarding'
            WHEN cins.call_subcategory ILIKE '%flight%' OR cins.call_subcategory ILIKE '%ticket%' THEN 'Flight Issue'
            WHEN cins.call_subcategory ILIKE '%name%' OR cins.call_subcategory ILIKE '%typo%' OR cins.call_subcategory ILIKE '%passenger%' THEN 'Passenger Details'
            WHEN cins.call_subcategory ILIKE '%billing%' OR cins.call_subcategory ILIKE '%payment%' OR cins.call_subcategory ILIKE '%charge%' THEN 'Billing / Payment'
            ELSE 'Other'
          END AS complaint,
          COUNT(*) AS frequency
        FROM case_insights cins
        JOIN case_interactions ci ON ci.id = cins.interaction_id
        WHERE cins.tenant_id=$1 AND cins.call_subcategory IS NOT NULL AND cins.call_subcategory <> '' ${chanClause}
        GROUP BY complaint ORDER BY frequency DESC LIMIT 15
      `, params1),

      pool.query(`
        SELECT moment->>'type' AS moment_type, COUNT(*) AS frequency
        FROM case_insights cins
        JOIN case_interactions ci ON ci.id = cins.interaction_id,
          jsonb_array_elements(cins.key_moments) AS moment
        WHERE cins.tenant_id=$1 AND cins.key_moments != '[]'::jsonb ${chanClause}
        GROUP BY moment->>'type' ORDER BY frequency DESC
      `, params1),

      pool.query(`
        SELECT ci.agent_name,
          COUNT(*) AS total_calls,
          ROUND(AVG(cins.customer_sentiment_score)::numeric,2) AS avg_customer_sentiment,
          ROUND(AVG(cins.agent_sentiment_score)::numeric,2) AS avg_agent_sentiment,
          COUNT(*) FILTER (WHERE cins.customer_sentiment_overall='Negative') AS negative_calls,
          COUNT(*) FILTER (WHERE cins.customer_sentiment_overall='Positive') AS positive_calls,
          COUNT(*) FILTER (WHERE cins.escalation_request=true) AS escalations,
          COUNT(*) FILTER (WHERE cins.threat_detected=true) AS threats
        FROM case_insights cins
        JOIN case_interactions ci ON ci.id = cins.interaction_id
        WHERE cins.tenant_id=$1 ${chanClause}
        GROUP BY ci.agent_name ORDER BY avg_customer_sentiment DESC
      `, params1),

      pool.query(`
        SELECT
          CASE
            WHEN cins.call_subcategory ILIKE '%refund%' OR cins.call_subcategory ILIKE '%cancel%' THEN 'Refund / Cancellation'
            WHEN cins.call_subcategory ILIKE '%modif%' OR cins.call_subcategory ILIKE '%change%' OR cins.call_subcategory ILIKE '%amend%' OR cins.call_subcategory ILIKE '%date change%' THEN 'Booking Modification'
            WHEN cins.call_subcategory ILIKE '%baggage%' OR cins.call_subcategory ILIKE '%luggage%' THEN 'Baggage'
            WHEN cins.call_subcategory ILIKE '%hotel%' THEN 'Hotel Issue'
            WHEN cins.call_subcategory ILIKE '%boarding%' OR cins.call_subcategory ILIKE '%check-in%' OR cins.call_subcategory ILIKE '%check in%' THEN 'Check-in / Boarding'
            WHEN cins.call_subcategory ILIKE '%flight%' OR cins.call_subcategory ILIKE '%ticket%' THEN 'Flight Issue'
            WHEN cins.call_subcategory ILIKE '%name%' OR cins.call_subcategory ILIKE '%typo%' OR cins.call_subcategory ILIKE '%passenger%' THEN 'Passenger Details'
            WHEN cins.call_subcategory ILIKE '%billing%' OR cins.call_subcategory ILIKE '%payment%' OR cins.call_subcategory ILIKE '%charge%' THEN 'Billing / Payment'
            ELSE 'Other'
          END AS product_type,
          COUNT(*) AS count
        FROM case_insights cins
        JOIN case_interactions ci ON ci.id = cins.interaction_id
        WHERE cins.tenant_id=$1 AND cins.call_subcategory IS NOT NULL AND cins.call_subcategory <> '' ${chanClause}
        GROUP BY product_type ORDER BY count DESC
      `, params1),
    ]);

    res.json({
      summary: summary.rows[0],
      categories: categories.rows,
      signals: signals.rows,
      complaints: complaints.rows,
      moments: moments.rows,
      sentimentByAgent: sentimentByAgent.rows,
      productTypes: productTypes.rows,
      locations: [],
      products: [],
    });
  } catch (e) {
    console.error('Cases insights all error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cases/insights/status — how many processed vs pending
router.get('/insights/status', async (req, res) => {
  const tenantId = req.user.tenantId;
  try {
    const total = await pool.query(`SELECT COUNT(*) FROM case_interactions WHERE tenant_id=$1`, [tenantId]);
    const processed = await pool.query(`SELECT COUNT(*) FROM case_insights WHERE tenant_id=$1 AND error IS NULL`, [tenantId]);
    res.json({ total: parseInt(total.rows[0].count), processed: parseInt(processed.rows[0].count) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
