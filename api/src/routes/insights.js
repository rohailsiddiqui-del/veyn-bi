const router = require('express').Router();
const db = require('../db');
const { processBatchInsights } = require('../services/insights');

async function resolveGroupTenant(user, forTenantId) {
  if (!user.groupId || !forTenantId) return null;
  const { rows } = await db.query(
    'SELECT id FROM tenants WHERE id=$1 AND group_id=$2 AND is_active=true',
    [forTenantId, user.groupId]
  );
  return rows.length ? forTenantId : null;
}

// Trigger insight processing for a batch (or all unprocessed)
router.post('/process', async (req, res) => {
  let tenantId = req.user.tenantId;
  const resolvedProcess = await resolveGroupTenant(req.user, req.query.forTenant);
  if (resolvedProcess) tenantId = resolvedProcess;
  const { batchId } = req.body;

  try {
    // Count pending
    const { rows } = await db.query(`
      SELECT COUNT(*) AS pending
      FROM calls c
      JOIN call_transcripts ct ON ct.call_id = c.id
      LEFT JOIN call_insights ci ON ci.call_id = c.id
      WHERE c.tenant_id = $1
        AND ($2::uuid IS NULL OR c.batch_id = $2)
        AND (ci.call_id IS NULL OR ci.error IS NOT NULL)
    `, [tenantId, batchId || null]);

    const pending = parseInt(rows[0].pending);
    if (pending === 0) return res.json({ message: 'No unprocessed transcripts found', pending: 0 });

    res.json({ message: `Processing ${pending} calls in background`, pending });

    // Run in background
    processBatchInsights(tenantId, batchId || null)
      .then(result => {
        console.log(`Insights done tenant=${tenantId}: ${result.processed} ok, ${result.errors} errors`);
        if (batchId) {
          db.query(
            'UPDATE upload_batches SET insights_status=$1, insights_processed=$2, insights_errors=$3 WHERE id=$4',
            ['done', result.processed, result.errors, batchId]
          );
        }
      })
      .catch(e => console.error('Insight batch error:', e.message));

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Aggregated endpoint — all insights data in one request (fast page load)
router.get('/all', async (req, res) => {
  let tenantId = req.user.tenantId;
  const resolvedAll = await resolveGroupTenant(req.user, req.query.forTenant);
  if (resolvedAll) tenantId = resolvedAll;
  const { from, to, batchId } = req.query;

  const params = [tenantId];
  let dateWhere = '';
  let callsDateWhere = ''; // same filters but no table alias (for subquery on calls table)
  if (from)    { params.push(from);    dateWhere += ` AND c.call_date >= $${params.length}`; callsDateWhere += ` AND call_date >= $${params.length}`; }
  if (to)      { params.push(to);      dateWhere += ` AND c.call_date <= $${params.length}`; callsDateWhere += ` AND call_date <= $${params.length}`; }
  if (batchId) { params.push(batchId); dateWhere += ` AND c.batch_id = $${params.length}`;          callsDateWhere += ` AND batch_id = $${params.length}`; }

  const baseWhere = `WHERE ci.tenant_id=$1${dateWhere}`;

  try {
    const [summary, categories, signals, complaints, moments, sentimentByAgent, locations, products, resolutionByCategory] =
      await Promise.all([
        // summary — total_analysed matches total_calls from overview (counts from calls table directly)
        db.query(`SELECT (SELECT COUNT(*) FROM calls WHERE tenant_id=$1${callsDateWhere}) AS total_analysed, COUNT(*) FILTER (WHERE ci.error IS NULL) AS success_count, COUNT(*) FILTER (WHERE ci.threat_detected=true) AS threat_calls, COUNT(*) FILTER (WHERE ci.social_media_mention=true) AS social_media_calls, COUNT(*) FILTER (WHERE ci.escalation_request=true) AS escalation_calls, COUNT(*) FILTER (WHERE ci.regulatory_mention=true) AS regulatory_calls, COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Positive') AS positive_calls, COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Negative') AS negative_calls, COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Neutral') AS neutral_calls, COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Mixed') AS mixed_calls, ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_customer_sentiment, ROUND(AVG(ci.agent_sentiment_score)::numeric,2) AS avg_agent_sentiment, ROUND(AVG(ci.customer_talk_pct)::numeric,1) AS avg_customer_talk_pct, COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved_calls, COUNT(*) FILTER (WHERE ci.call_outcome='Unresolved') AS unresolved_calls, COUNT(*) FILTER (WHERE ci.call_outcome='Escalated') AS escalated_calls FROM call_insights ci JOIN calls c ON c.id=ci.call_id ${baseWhere}`, params),
        // categories — grouped by top-level category only to avoid subcategory fragmentation
        db.query(`SELECT ci.call_category, COUNT(*) AS count, ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_sentiment FROM call_insights ci JOIN calls c ON c.id=ci.call_id ${baseWhere} AND ci.call_category IS NOT NULL GROUP BY ci.call_category ORDER BY count DESC LIMIT 15`, params),
        // signals (flagged calls)
        db.query(`SELECT c.id AS call_id, c.call_ref, c.agent_name, c.call_date, ci.call_category, ci.call_outcome, ci.threat_detected, ci.threat_details, ci.social_media_mention, ci.social_media_details, ci.escalation_request, ci.escalation_details, ci.regulatory_mention, ci.regulatory_details, ci.customer_sentiment_overall, ci.summary, ci.key_moments FROM call_insights ci JOIN calls c ON c.id=ci.call_id ${baseWhere} AND (ci.threat_detected=true OR ci.social_media_mention=true OR ci.escalation_request=true OR ci.regulatory_mention=true) ORDER BY c.call_date DESC LIMIT 100`, params),
        // complaints — normalize case/whitespace to collapse duplicates from AI free-text generation
        db.query(`SELECT INITCAP(LOWER(TRIM(complaint))) AS complaint, COUNT(*) AS frequency FROM call_insights ci JOIN calls c ON c.id=ci.call_id, jsonb_array_elements_text(ci.top_complaints) AS complaint ${baseWhere} AND ci.top_complaints != '[]'::jsonb GROUP BY LOWER(TRIM(complaint)) ORDER BY frequency DESC LIMIT 15`, params),
        // moments
        db.query(`SELECT moment->>'type' AS moment_type, COUNT(*) AS frequency FROM call_insights ci JOIN calls c ON c.id=ci.call_id, jsonb_array_elements(ci.key_moments) AS moment ${baseWhere} AND ci.key_moments != '[]'::jsonb GROUP BY moment->>'type' ORDER BY frequency DESC`, params),
        // agent performance — includes resolution rate and full signal counts for agent table
        db.query(`SELECT c.agent_name, COUNT(*) AS total_calls, ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_customer_sentiment, ROUND(AVG(ci.agent_sentiment_score)::numeric,2) AS avg_agent_sentiment, COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Negative') AS negative_calls, COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Positive') AS positive_calls, COUNT(*) FILTER (WHERE ci.escalation_request=true) AS escalations, COUNT(*) FILTER (WHERE ci.threat_detected=true) AS threats, COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved_calls, ROUND(100.0 * COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') / NULLIF(COUNT(*),0), 0) AS resolution_rate FROM call_insights ci JOIN calls c ON c.id=ci.call_id ${baseWhere} GROUP BY c.agent_name ORDER BY avg_customer_sentiment DESC`, params),
        // locations
        db.query(`SELECT ci.location_mentioned AS location, COUNT(*) AS call_count, COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved, COUNT(*) FILTER (WHERE ci.call_outcome='Unresolved') AS unresolved, COUNT(*) FILTER (WHERE ci.call_outcome='Escalated') AS escalated, ROUND(AVG(ci.customer_sentiment_score)::numeric,1) AS avg_sentiment FROM call_insights ci JOIN calls c ON c.id=ci.call_id ${baseWhere} AND ci.location_mentioned IS NOT NULL GROUP BY ci.location_mentioned ORDER BY call_count DESC`, params),
        // products
        db.query(`SELECT product, COUNT(*) AS frequency FROM call_insights ci JOIN calls c ON c.id=ci.call_id, jsonb_array_elements_text(ci.product_mentions) AS product ${baseWhere} AND ci.product_mentions != '[]'::jsonb GROUP BY product ORDER BY frequency DESC LIMIT 30`, params),
        // resolution rate by call category — QSR operational insight
        db.query(`SELECT ci.call_category, COUNT(*) AS total, COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved, COUNT(*) FILTER (WHERE ci.call_outcome='Unresolved') AS unresolved, COUNT(*) FILTER (WHERE ci.call_outcome='Escalated') AS escalated, ROUND(AVG(ci.customer_sentiment_score)::numeric,1) AS avg_sentiment FROM call_insights ci JOIN calls c ON c.id=ci.call_id ${baseWhere} AND ci.call_category IS NOT NULL GROUP BY ci.call_category ORDER BY total DESC LIMIT 10`, params),
      ]);

    res.json({
      summary: summary.rows[0],
      categories: categories.rows,
      signals: signals.rows,
      complaints: complaints.rows,
      moments: moments.rows,
      sentimentByAgent: sentimentByAgent.rows,
      locations: locations.rows,
      products: products.rows,
      resolutionByCategory: resolutionByCategory.rows,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Insights summary — top-level KPIs
router.get('/summary', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let join = 'JOIN calls c ON c.id = ci.call_id';
    let where = 'WHERE ci.tenant_id=$1';
    const params = [tenantId];

    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        COUNT(*) AS total_analysed,
        COUNT(*) FILTER (WHERE ci.error IS NULL) AS success_count,
        COUNT(*) FILTER (WHERE ci.threat_detected = true) AS threat_calls,
        COUNT(*) FILTER (WHERE ci.social_media_mention = true) AS social_media_calls,
        COUNT(*) FILTER (WHERE ci.escalation_request = true) AS escalation_calls,
        COUNT(*) FILTER (WHERE ci.regulatory_mention = true) AS regulatory_calls,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall = 'Positive') AS positive_calls,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall = 'Negative') AS negative_calls,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall = 'Neutral') AS neutral_calls,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall = 'Mixed') AS mixed_calls,
        ROUND(AVG(ci.customer_sentiment_score)::numeric, 2) AS avg_customer_sentiment,
        ROUND(AVG(ci.agent_sentiment_score)::numeric, 2) AS avg_agent_sentiment,
        ROUND(AVG(ci.customer_talk_pct)::numeric, 1) AS avg_customer_talk_pct,
        ROUND(AVG(ci.agent_talk_pct)::numeric, 1) AS avg_agent_talk_pct,
        COUNT(*) FILTER (WHERE ci.call_outcome = 'Resolved') AS resolved_calls,
        COUNT(*) FILTER (WHERE ci.call_outcome = 'Unresolved') AS unresolved_calls,
        COUNT(*) FILTER (WHERE ci.call_outcome = 'Escalated') AS escalated_calls
      FROM call_insights ci
      ${join} ${where}
    `, params);

    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Call categories breakdown
router.get('/categories', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        ci.call_category,
        ci.call_subcategory,
        COUNT(*) AS count,
        ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_sentiment,
        COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved,
        COUNT(*) FILTER (WHERE ci.call_outcome='Unresolved') AS unresolved
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id
      ${where} AND ci.call_category IS NOT NULL
      GROUP BY ci.call_category, ci.call_subcategory
      ORDER BY count DESC
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Top complaints (aggregated across all calls)
router.get('/complaints', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId, limit = 20 } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1 AND ci.top_complaints != \'[]\'::jsonb';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    // Expand JSONB array and count occurrences
    const r = await db.query(`
      SELECT
        complaint,
        COUNT(*) AS frequency,
        ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_sentiment
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id,
      jsonb_array_elements_text(ci.top_complaints) AS complaint
      ${where}
      GROUP BY complaint
      ORDER BY frequency DESC
      LIMIT $${params.length + 1}
    `, [...params, parseInt(limit)]);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Sentiment breakdown by agent
router.get('/sentiment-by-agent', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        c.agent_name,
        COUNT(*) AS total_calls,
        ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_customer_sentiment,
        ROUND(AVG(ci.agent_sentiment_score)::numeric,2) AS avg_agent_sentiment,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Negative') AS negative_calls,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Positive') AS positive_calls,
        COUNT(*) FILTER (WHERE ci.escalation_request=true) AS escalations,
        COUNT(*) FILTER (WHERE ci.threat_detected=true) AS threats,
        ci.agent_sentiment_overall AS dominant_tone
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id
      ${where}
      GROUP BY c.agent_name, ci.agent_sentiment_overall
      ORDER BY avg_customer_sentiment DESC
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Signal intelligence — flagged calls
router.get('/signals', async (req, res) => {
  let tenantId = req.user.tenantId;
  const resolved = await resolveGroupTenant(req.user, req.query.forTenant);
  if (resolved) tenantId = resolved;
  const { from, to, batchId, type } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    // Filter by signal type
    if (type === 'threat')          where += ' AND ci.threat_detected = true';
    else if (type === 'social')     where += ' AND ci.social_media_mention = true';
    else if (type === 'escalation') where += ' AND ci.escalation_request = true';
    else if (type === 'regulatory') where += ' AND ci.regulatory_mention = true';
    else if (type === 'negative')   where += " AND ci.customer_sentiment_overall = 'Negative'";
    else if (type === 'positive')   where += " AND ci.customer_sentiment_overall = 'Positive'";
    else where += ' AND (ci.threat_detected=true OR ci.social_media_mention=true OR ci.escalation_request=true OR ci.regulatory_mention=true)';

    const r = await db.query(`
      SELECT
        c.id AS call_id,
        c.call_ref,
        c.agent_name,
        c.call_date,
        c.score,
        ci.call_category,
        ci.call_outcome,
        ci.threat_detected, ci.threat_details,
        ci.social_media_mention, ci.social_media_details,
        ci.escalation_request, ci.escalation_details,
        ci.regulatory_mention, ci.regulatory_details,
        ci.customer_sentiment_overall,
        ci.summary,
        ci.key_moments
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id
      ${where}
      ORDER BY c.call_date DESC
      LIMIT 100
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Location breakdown
router.get('/locations', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1 AND ci.location_mentioned IS NOT NULL';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        ci.location_mentioned AS location,
        COUNT(*) AS call_count,
        ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_sentiment,
        COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved,
        COUNT(*) FILTER (WHERE ci.threat_detected=true) AS threats
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id
      ${where}
      GROUP BY ci.location_mentioned
      ORDER BY call_count DESC
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Product mentions
router.get('/products', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1 AND ci.product_mentions != \'[]\'::jsonb';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        product,
        COUNT(*) AS frequency,
        ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_sentiment
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id,
      jsonb_array_elements_text(ci.product_mentions) AS product
      ${where}
      GROUP BY product
      ORDER BY frequency DESC
      LIMIT 30
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Key moments across all calls (most common moment types)
router.get('/moments', async (req, res) => {
  const { tenantId } = req.user;
  const { from, to, batchId } = req.query;

  try {
    let where = 'WHERE ci.tenant_id=$1 AND ci.key_moments != \'[]\'::jsonb';
    const params = [tenantId];
    if (from)    { params.push(from);    where += ` AND c.call_date >= $${params.length}`; }
    if (to)      { params.push(to);      where += ` AND c.call_date <= $${params.length}`; }
    if (batchId) { params.push(batchId); where += ` AND c.batch_id = $${params.length}`; }

    const r = await db.query(`
      SELECT
        moment->>'type' AS moment_type,
        COUNT(*) AS frequency,
        array_agg(DISTINCT moment->>'description') FILTER (WHERE moment->>'description' IS NOT NULL) AS examples
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id,
      jsonb_array_elements(ci.key_moments) AS moment
      ${where}
      GROUP BY moment->>'type'
      ORDER BY frequency DESC
    `, params);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Build tenant access check — group users can access any portal in their group
function tenantAccessClause(user, paramIdx) {
  if (user.groupId) {
    return `ci.tenant_id IN (SELECT id FROM tenants WHERE group_id = $${paramIdx} AND is_active = true)`;
  }
  return `ci.tenant_id = $${paramIdx}`;
}
function tenantAccessParam(user) {
  return user.groupId || user.tenantId;
}

// Individual call insight detail
router.get('/call/:callId', async (req, res) => {
  const tenantClause = tenantAccessClause(req.user, 2);
  const tenantParam  = tenantAccessParam(req.user);

  try {
    const r = await db.query(`
      SELECT ci.*, c.call_ref, c.agent_name, c.call_date, c.score, c.status
      FROM call_insights ci
      JOIN calls c ON c.id = ci.call_id
      WHERE ci.call_id = $1 AND ${tenantClause}
    `, [req.params.callId, tenantParam]);

    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Full call detail — insight + transcript (for audit trail panel)
router.get('/call/:callId/full', async (req, res) => {
  const tenantClause = tenantAccessClause(req.user, 2);
  const tenantParam  = tenantAccessParam(req.user);

  try {
    const [insightRes, transcriptRes] = await Promise.all([
      db.query(`
        SELECT ci.*, c.call_ref, c.agent_name, c.call_date, c.score, c.status, c.direction
        FROM call_insights ci
        JOIN calls c ON c.id = ci.call_id
        WHERE ci.call_id = $1 AND ${tenantClause}
      `, [req.params.callId, tenantParam]),

      // Access already verified by insight query above; just fetch by call_id
      db.query(`
        SELECT translation_text, transcription_text
        FROM call_transcripts
        WHERE call_id = $1
      `, [req.params.callId]),
    ]);

    if (!insightRes.rows.length) return res.status(404).json({ error: 'Not found' });

    const insight = insightRes.rows[0];
    const transcript = transcriptRes.rows[0] || null;

    res.json({ insight, transcript });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Keyword drilldown — search top_complaints + summary for a keyword across all group portals
router.get('/keyword-drilldown', async (req, res) => {
  const { keyword = 'refund', from, to } = req.query;
  const kw = `%${keyword.toLowerCase()}%`;

  try {
    // Build tenant filter: group users see all portals, single users see their own
    let tenantWhere;
    let params;
    if (req.user.groupId) {
      const { rows } = await db.query(
        'SELECT id FROM tenants WHERE group_id=$1 AND is_active=true',
        [req.user.groupId]
      );
      const ids = rows.map(r => r.id);
      if (!ids.length) return res.json({ calls: [], summary: {} });
      tenantWhere = `c.tenant_id = ANY($1::uuid[])`;
      params = [ids];
    } else {
      tenantWhere = `c.tenant_id = $1`;
      params = [req.user.tenantId];
    }

    let dateWhere = '';
    if (from) { params.push(from); dateWhere += ` AND c.call_date >= $${params.length}`; }
    if (to)   { params.push(to);   dateWhere += ` AND c.call_date <= $${params.length}`; }

    params.push(kw);
    const kwIdx = params.length;

    const r = await db.query(`
      SELECT
        c.id AS call_id, c.call_ref, c.agent_name, c.call_date, c.score,
        t.name AS portal,
        ci.call_category, ci.call_outcome, ci.customer_sentiment_overall,
        ci.threat_detected, ci.threat_details,
        ci.social_media_mention, ci.social_media_details,
        ci.escalation_request, ci.escalation_details,
        ci.regulatory_mention, ci.regulatory_details,
        ci.top_complaints, ci.summary
      FROM calls c
      JOIN tenants t ON t.id = c.tenant_id
      JOIN call_insights ci ON ci.call_id = c.id
      WHERE ${tenantWhere} ${dateWhere}
        AND (
          LOWER(ci.top_complaints::text) LIKE $${kwIdx}
          OR LOWER(ci.summary) LIKE $${kwIdx}
          OR LOWER(ci.threat_details) LIKE $${kwIdx}
          OR LOWER(ci.escalation_details) LIKE $${kwIdx}
        )
      ORDER BY ci.threat_detected DESC, ci.social_media_mention DESC,
               ci.escalation_request DESC, c.score ASC
      LIMIT 200
    `, params);

    const calls = r.rows;

    // Summary stats
    const summary = {
      total: calls.length,
      threats: calls.filter(c => c.threat_detected).length,
      social: calls.filter(c => c.social_media_mention).length,
      escalations: calls.filter(c => c.escalation_request).length,
      regulatory: calls.filter(c => c.regulatory_mention).length,
      outcomes: {},
      sentiments: {},
      byPortal: {},
      byAgent: {},
    };

    for (const c of calls) {
      const outcome = c.call_outcome || 'Unknown';
      summary.outcomes[outcome] = (summary.outcomes[outcome] || 0) + 1;
      const sent = c.customer_sentiment_overall || 'Unknown';
      summary.sentiments[sent] = (summary.sentiments[sent] || 0) + 1;
      summary.byPortal[c.portal] = (summary.byPortal[c.portal] || 0) + 1;
      if (c.agent_name) summary.byAgent[c.agent_name] = (summary.byAgent[c.agent_name] || 0) + 1;
    }

    res.json({ calls, summary, keyword });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
