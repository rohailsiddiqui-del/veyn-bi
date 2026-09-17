// Group routes — consolidated view across multiple portals (e.g. Domino's)
const router = require('express').Router();
const db = require('../db');

// Middleware: ensure user belongs to a group
function requireGroup(req, res, next) {
  if (!req.user.groupId) return res.status(403).json({ error: 'Not a group user' });
  next();
}

// Always fetch live portal IDs from DB — JWT may be stale if portals were added after login
async function getLivePortalIds(groupId, specificPortalId = null) {
  const { rows } = await db.query(
    `SELECT id FROM tenants WHERE group_id=$1 AND is_active=true ORDER BY portal_order`,
    [groupId]
  );
  const all = rows.map(r => r.id);
  if (specificPortalId) {
    return all.includes(specificPortalId) ? [specificPortalId] : [];
  }
  return all;
}

// GET /api/group/portals — list portals + settings for this group
router.get('/portals', requireGroup, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, portal_type, portal_order, insights_enabled,
              voice_app_username, voice_app_org_id, voice_app_eval_url
       FROM tenants WHERE group_id=$1 AND is_active=true ORDER BY portal_order`,
      [req.user.groupId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/group/portals/:portalId/insights — toggle insights on/off
router.patch('/portals/:portalId/insights', requireGroup, async (req, res) => {
  const { portalId } = req.params;
  const { enabled } = req.body;
  try {
    // Verify portal belongs to this group
    const { rows } = await db.query(
      'UPDATE tenants SET insights_enabled=$1 WHERE id=$2 AND group_id=$3 RETURNING id, insights_enabled',
      [!!enabled, portalId, req.user.groupId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Portal not found' });
    res.json({ id: rows[0].id, insights_enabled: rows[0].insights_enabled });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/group/overview — consolidated KPIs across all portals
router.get('/overview', requireGroup, async (req, res) => {
  const { from, to, portalId } = req.query;
  const portalIds = await getLivePortalIds(req.user.groupId, portalId || null);
  if (!portalIds.length) return res.json([]);

  try {
    const results = await Promise.all(portalIds.map(async (tid) => {
      let where = 'WHERE tenant_id=$1';
      const params = [tid];
      if (from) { params.push(from); where += ` AND call_date >= $${params.length}`; }
      if (to)   { params.push(to);   where += ` AND call_date <= $${params.length}`; }

      const [summary, tenant] = await Promise.all([
        db.query(`
          SELECT
            COUNT(*) AS total_calls,
            ROUND(AVG(score),2) AS avg_score,
            COUNT(*) FILTER (WHERE status='ERROR FREE') AS error_free,
            COUNT(*) FILTER (WHERE status='DEFICIENT') AS deficient,
            ROUND(AVG(call_duration_seconds)::numeric/60,1) AS avg_duration_min,
            MIN(call_date) AS date_from,
            MAX(call_date) AS date_to
          FROM calls ${where}
        `, params),
        db.query('SELECT id, name, portal_type, insights_enabled FROM tenants WHERE id=$1', [tid]),
      ]);

      return {
        ...tenant.rows[0],
        ...summary.rows[0],
      };
    }));

    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/group/agents — agents across portals with portal tags
router.get('/agents', requireGroup, async (req, res) => {
  const { from, to, portalId } = req.query;
  const portalIds = await getLivePortalIds(req.user.groupId, portalId || null);
  if (!portalIds.length) return res.json([]);

  try {
    let where = `WHERE c.tenant_id = ANY($1::uuid[])`;
    const params = [portalIds];
    if (from) { params.push(from); where += ` AND c.call_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND c.call_date <= $${params.length}`; }

    const { rows } = await db.query(`
      SELECT
        c.agent_name,
        t.portal_type,
        t.name AS portal_name,
        COUNT(*) AS total_calls,
        ROUND(AVG(c.score),2) AS avg_score,
        ROUND(MIN(c.score),2) AS min_score,
        ROUND(MAX(c.score),2) AS max_score,
        COUNT(*) FILTER (WHERE c.status='ERROR FREE') AS error_free,
        COUNT(*) FILTER (WHERE c.status='DEFICIENT') AS deficient,
        ROUND(AVG(c.call_duration_seconds)::numeric/60,1) AS avg_duration_min
      FROM calls c
      JOIN tenants t ON t.id = c.tenant_id
      ${where}
      GROUP BY c.agent_name, t.id, t.portal_type, t.name
      ORDER BY avg_score DESC
    `, params);

    // Merge agents that appear in multiple portals
    const agentMap = {};
    for (const row of rows) {
      const key = row.agent_name;
      if (!agentMap[key]) {
        agentMap[key] = {
          agent_name: row.agent_name,
          portals: [],
          total_calls: 0,
          avg_score: [],
          error_free: 0,
          deficient: 0,
        };
      }
      agentMap[key].portals.push({ type: row.portal_type, name: row.portal_name });
      agentMap[key].total_calls += parseInt(row.total_calls);
      agentMap[key].avg_score.push(parseFloat(row.avg_score));
      agentMap[key].error_free += parseInt(row.error_free);
      agentMap[key].deficient += parseInt(row.deficient);
    }

    const agents = Object.values(agentMap).map(a => ({
      ...a,
      avg_score: a.avg_score.length ? parseFloat((a.avg_score.reduce((x,y) => x+y, 0) / a.avg_score.length).toFixed(2)) : null,
    })).sort((a,b) => (b.avg_score||0) - (a.avg_score||0));

    res.json(agents);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/group/scorecards — per-portal scorecard (params + agent breakdown)
router.get('/scorecards', requireGroup, async (req, res) => {
  const { from, to, portalId } = req.query;
  const portalIds = await getLivePortalIds(req.user.groupId, portalId || null);
  if (!portalIds.length) return res.json([]);

  try {
    const results = await Promise.all(portalIds.map(async (tid) => {
      let callWhere = 'c.tenant_id=$1';
      const params = [tid];
      if (from) { params.push(from); callWhere += ` AND c.call_date >= $${params.length}`; }
      if (to)   { params.push(to);   callWhere += ` AND c.call_date <= $${params.length}`; }

      const [tenant, params_data, agents] = await Promise.all([
        db.query('SELECT id, name, portal_type FROM tenants WHERE id=$1', [tid]),
        db.query(`
          SELECT
            ps.param_name,
            ROUND(AVG(ps.score),2) AS avg_score,
            ROUND(MAX(ps.score),2) AS max_observed,
            ROUND(
              CASE WHEN MAX(ps.score) > 0
                THEN AVG(ps.score) / MAX(ps.score) * 100
                ELSE 0
              END
            , 1) AS pct,
            COUNT(DISTINCT ps.call_id) AS call_count
          FROM call_param_scores ps
          JOIN calls c ON c.id = ps.call_id
          WHERE ${callWhere}
          GROUP BY ps.param_name
          ORDER BY pct ASC
        `, params),
        db.query(`
          SELECT
            c.agent_name,
            COUNT(*) AS total_calls,
            ROUND(AVG(c.score),2) AS avg_score,
            COUNT(*) FILTER (WHERE c.status='ERROR FREE') AS error_free,
            COUNT(*) FILTER (WHERE c.status='DEFICIENT') AS deficient
          FROM calls c
          WHERE ${callWhere}
          GROUP BY c.agent_name
          ORDER BY avg_score DESC
          LIMIT 20
        `, params),
      ]);

      return {
        ...tenant.rows[0],
        parameters: params_data.rows,
        agents: agents.rows,
      };
    }));

    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/group/branches — branch analytics for complaint portals
router.get('/branches', requireGroup, async (req, res) => {
  const { from, to, portalId } = req.query;

  // Only complaint portals
  const portalRes = await db.query(
    `SELECT id FROM tenants WHERE group_id=$1 AND portal_type IN ('complaint_inbound','complaint_outbound') AND is_active=true`,
    [req.user.groupId]
  );
  let portalIds = portalRes.rows.map(r => r.id);
  if (portalId) portalIds = portalIds.filter(id => id === portalId);
  if (!portalIds.length) return res.json([]);

  try {
    let where = `WHERE c.tenant_id = ANY($1::uuid[]) AND c.branch_name IS NOT NULL AND c.branch_name != ''`;
    const params = [portalIds];
    if (from) { params.push(from); where += ` AND c.call_date >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND c.call_date <= $${params.length}`; }

    const { rows } = await db.query(`
      SELECT
        c.branch_name,
        t.portal_type,
        COUNT(*) AS total_complaints,
        ROUND(AVG(c.score),2) AS avg_score,
        COUNT(*) FILTER (WHERE c.status='ERROR FREE') AS resolved,
        COUNT(*) FILTER (WHERE c.status='DEFICIENT') AS unresolved
      FROM calls c
      JOIN tenants t ON t.id = c.tenant_id
      ${where}
      GROUP BY c.branch_name, t.portal_type
      ORDER BY total_complaints DESC
    `, params);

    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/group/insights — insights across portals (only enabled ones)
router.get('/insights', requireGroup, async (req, res) => {
  const { from, to, portalId } = req.query;

  try {
    // Get portals that have insights enabled
    const portalRes = await db.query(
      `SELECT id, name, portal_type FROM tenants WHERE group_id=$1 AND insights_enabled=true AND is_active=true`,
      [req.user.groupId]
    );
    let portals = portalRes.rows;
    if (portalId) portals = portals.filter(p => p.id === portalId);
    if (!portals.length) return res.json({ message: 'Insights not enabled for any portal', insights: [] });

    const allInsights = [];
    for (const portal of portals) {
      let where = 'WHERE tenant_id=$1';
      const params = [portal.id];
      if (from) { params.push(from); where += ` AND generated_at::date >= $${params.length}`; }
      if (to)   { params.push(to);   where += ` AND generated_at::date <= $${params.length}`; }

      const { rows } = await db.query(
        `SELECT * FROM call_insights ${where} ORDER BY generated_at DESC LIMIT 50`,
        params
      ).catch(() => ({ rows: [] }));

      allInsights.push(...rows.map(r => ({ ...r, portal_type: portal.portal_type, portal_name: portal.name })));
    }

    res.json({ insights: allInsights });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/group/branches/extract — extract branch names from transcripts for complaint portals
router.post('/branches/extract', requireGroup, async (req, res) => {
  const { GoogleAuth } = require('google-auth-library');
  const VERTEX_PROJECT  = process.env.VERTEX_PROJECT  || 'veyn-whatsapp-bot';
  const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
  const VERTEX_MODEL    = process.env.VERTEX_MODEL    || 'gemini-2.5-flash';
  const VERTEX_API      = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

  // Get complaint portal IDs for this group
  const portalRes = await db.query(
    `SELECT id FROM tenants WHERE group_id=$1 AND portal_type IN ('complaint_inbound','complaint_outbound') AND is_active=true`,
    [req.user.groupId]
  );
  const portalIds = portalRes.rows.map(r => r.id);
  if (!portalIds.length) return res.json({ message: 'No complaint portals found', updated: 0 });

  // Find calls with transcripts but no branch_name set
  const { rows: callsToProcess } = await db.query(`
    SELECT c.id, ct.translation_text, ct.transcription_text
    FROM calls c
    JOIN call_transcripts ct ON ct.call_id = c.id
    WHERE c.tenant_id = ANY($1::uuid[])
      AND (c.branch_name IS NULL OR c.branch_name = '')
      AND (ct.translation_text IS NOT NULL OR ct.transcription_text IS NOT NULL)
    LIMIT 200
  `, [portalIds]);

  if (!callsToProcess.length) {
    return res.json({ message: 'All calls already have branch names extracted', updated: 0 });
  }

  // Respond immediately — processing runs in background
  res.json({ message: `Extracting branch names for ${callsToProcess.length} calls in background`, queued: callsToProcess.length });

  // Background processing
  (async () => {
    let auth;
    try {
      auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    } catch (e) { console.error('Branch extract auth error:', e.message); return; }

    const BRANCH_PROMPT = `You are analyzing a call center transcript. Extract the specific branch, outlet, store, or location name that the customer is complaining about or referencing.

Return a JSON object with EXACTLY this structure (no markdown, no extra keys):
{"branch_name": "string or null"}

Rules:
- Extract the most specific location identifier (e.g. "DHA Branch", "Gulshan Outlet", "Defence Phase 5 Store")
- If the customer mentions an area or neighborhood as the branch location, use that
- If the agent confirms or mentions a branch name, use that
- If no specific branch or outlet is mentioned, return null
- Do NOT return a city name alone (like "Karachi") unless it's the only location mentioned
- Keep the name concise — 1-5 words maximum

Transcript:
`;

    let updated = 0;
    const concurrency = 5;

    for (let i = 0; i < callsToProcess.length; i += concurrency) {
      const batch = callsToProcess.slice(i, i + concurrency);
      await Promise.all(batch.map(async (call) => {
        const transcript = call.translation_text || call.transcription_text || '';
        if (transcript.trim().length < 50) return;

        try {
          const client = await auth.getClient();
          const token = await client.getAccessToken();

          const truncated = transcript.length > 4000 ? transcript.slice(0, 3000) + '\n...\n' + transcript.slice(-1000) : transcript;

          const response = await fetch(VERTEX_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token.token}` },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: BRANCH_PROMPT + truncated }] }],
              generationConfig: { temperature: 0.0, maxOutputTokens: 128, responseMimeType: 'application/json' }
            })
          });

          if (!response.ok) return;
          const data = await response.json();
          const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!raw) return;

          const parsed = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
          if (parsed.branch_name) {
            await db.query(
              `UPDATE calls SET branch_name = $1 WHERE id = $2 AND (branch_name IS NULL OR branch_name = '')`,
              [parsed.branch_name, call.id]
            );
            updated++;
          }
        } catch (e) {
          console.error(`Branch extract error call ${call.id}:`, e.message);
        }
      }));
    }
    console.log(`Branch extraction complete: ${updated}/${callsToProcess.length} updated`);
  })();
});

module.exports = router;
