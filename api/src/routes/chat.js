const router = require('express').Router();
const db = require('../db');
const { GoogleAuth } = require('google-auth-library');

const VERTEX_PROJECT  = process.env.VERTEX_PROJECT  || 'veyn-whatsapp-bot';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const VERTEX_MODEL    = 'gemini-2.5-flash';
const VERTEX_API      = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

let _authClient = null;
async function getAccessToken() {
  if (!_authClient) {
    _authClient = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  }
  const client = await _authClient.getClient();
  const token = await client.getAccessToken();
  return token.token;
}

async function getDataContext(tenantId) {
  const [summary, agents, params, insightsSummary, topComplaints, categories] = await Promise.all([
    db.query(`
      SELECT COUNT(*) AS total_calls, ROUND(AVG(score),2) AS avg_score,
        COUNT(*) FILTER (WHERE status='ERROR FREE') AS error_free,
        COUNT(*) FILTER (WHERE status='DEFICIENT') AS deficient,
        MIN(call_date) AS date_from, MAX(call_date) AS date_to
      FROM calls WHERE tenant_id=$1`, [tenantId]),

    db.query(`
      SELECT agent_name, COUNT(*) AS calls, ROUND(AVG(score),2) AS avg_score
      FROM calls WHERE tenant_id=$1
      GROUP BY agent_name ORDER BY avg_score DESC`, [tenantId]),

    db.query(`
      SELECT p.param_name, ROUND(AVG(p.score),2) AS avg_score,
        ROUND(COUNT(*) FILTER (WHERE p.score=0)::numeric/COUNT(*)*100,1) AS zero_pct
      FROM call_param_scores p
      JOIN calls c ON p.call_id=c.id
      WHERE p.tenant_id=$1
      GROUP BY p.param_name ORDER BY zero_pct DESC LIMIT 10`, [tenantId]),

    db.query(`
      SELECT
        COUNT(*) AS total_analysed,
        ROUND(AVG(ci.customer_sentiment_score)::numeric,2) AS avg_sentiment,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Positive') AS positive_calls,
        COUNT(*) FILTER (WHERE ci.customer_sentiment_overall='Negative') AS negative_calls,
        COUNT(*) FILTER (WHERE ci.call_outcome='Resolved') AS resolved_calls,
        COUNT(*) FILTER (WHERE ci.call_outcome='Unresolved') AS unresolved_calls,
        COUNT(*) FILTER (WHERE ci.call_outcome='Escalated') AS escalated_calls,
        COUNT(*) FILTER (WHERE ci.threat_detected=true) AS threat_calls,
        COUNT(*) FILTER (WHERE ci.escalation_request=true) AS escalation_calls,
        COUNT(*) FILTER (WHERE ci.social_media_mention=true) AS social_media_calls,
        COUNT(*) FILTER (WHERE ci.regulatory_mention=true) AS regulatory_calls,
        ROUND(AVG(ci.customer_talk_pct)::numeric,1) AS avg_customer_talk_pct
      FROM call_insights ci WHERE ci.tenant_id=$1`, [tenantId]),

    db.query(`
      SELECT complaint, COUNT(*) AS frequency
      FROM call_insights ci,
      jsonb_array_elements_text(ci.top_complaints) AS complaint
      WHERE ci.tenant_id=$1 AND ci.top_complaints != '[]'::jsonb
      GROUP BY complaint ORDER BY frequency DESC LIMIT 8`, [tenantId]),

    db.query(`
      SELECT ci.call_category, COUNT(*) AS count
      FROM call_insights ci WHERE ci.tenant_id=$1 AND ci.call_category IS NOT NULL
      GROUP BY ci.call_category ORDER BY count DESC LIMIT 6`, [tenantId]),
  ]);

  return {
    summary: summary.rows[0],
    agents: agents.rows,
    weakParams: params.rows,
    insights: insightsSummary.rows[0],
    topComplaints: topComplaints.rows,
    categories: categories.rows,
  };
}

router.post('/', async (req, res) => {
  const { tenantId } = req.user;
  const { message, history = [] } = req.body;

  if (!message) return res.status(400).json({ error: 'Message required' });

  try {
    const ctx = await getDataContext(tenantId);
    const ins = ctx.insights;

    const resRate = ins && ins.total_analysed > 0
      ? Math.round(ins.resolved_calls / ins.total_analysed * 100) : null;

    const systemPrompt = `You are a CX Analytics AI assistant. You have access to call center QA evaluation data and AI-extracted call insights.

=== QA SCORES ===
- Total calls: ${ctx.summary.total_calls}
- Date range: ${ctx.summary.date_from} to ${ctx.summary.date_to}
- Average score: ${ctx.summary.avg_score}/100
- Error Free: ${ctx.summary.error_free} | Deficient: ${ctx.summary.deficient}

Agents (by score):
${ctx.agents.map(a => `- ${a.agent_name}: ${a.calls} calls, avg score ${a.avg_score}`).join('\n')}

Top failing parameters (% calls scored 0):
${ctx.weakParams.map(p => `- ${p.param_name}: ${p.zero_pct}% failure rate, avg score ${p.avg_score}`).join('\n')}

=== AI INSIGHTS (from transcript analysis) ===
${ins && ins.total_analysed > 0 ? `
- Analysed calls: ${ins.total_analysed}
- Avg customer sentiment: ${ins.avg_sentiment} (−1 negative, +1 positive)
- Positive calls: ${ins.positive_calls} | Negative: ${ins.negative_calls}
- Resolution rate: ${resRate}% (${ins.resolved_calls} resolved, ${ins.unresolved_calls} unresolved, ${ins.escalated_calls} escalated)
- Customer talk share: ${ins.avg_customer_talk_pct}% avg
- Signals: ${ins.threat_calls} threats, ${ins.escalation_calls} escalations, ${ins.social_media_calls} social media mentions, ${ins.regulatory_calls} regulatory mentions

Top call categories:
${ctx.categories.map(c => `- ${c.call_category}: ${c.count} calls`).join('\n')}

Top customer complaints:
${ctx.topComplaints.map((c, i) => `${i+1}. "${c.complaint}" (${c.frequency} calls)`).join('\n')}
` : '- No insights data yet (transcripts not yet processed)'}

Answer questions about this data concisely. Compare agents, identify coaching opportunities, explain complaint patterns. If asked about something not in the data, say so clearly. Keep responses short and actionable.`;

    const contents = [
      ...history.map(h => ({ role: h.role, parts: [{ text: h.content }] })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const accessToken = await getAccessToken();
    const response = await fetch(VERTEX_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Vertex chat error:', JSON.stringify(data));
      return res.status(500).json({ error: data.error?.message || 'Vertex AI error' });
    }
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated';

    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
