const db = require('../db');
const { getIndustryPrompt } = require('./industry-prompts');
const { sendBatchAlerts } = require('./alerts');
const { GoogleAuth } = require('google-auth-library');

const VERTEX_PROJECT  = process.env.VERTEX_PROJECT  || 'veyn-whatsapp-bot';
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
// gemini-2.5-flash is known to work on this GCP project (from memory notes)
const VERTEX_MODEL    = process.env.VERTEX_MODEL || 'gemini-2.5-flash';
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

const EXTRACTION_PROMPT = `You are a call center intelligence analyst. Analyze the following diarized call transcript between a Customer and an Agent. The transcript may be in English, Urdu, Roman Urdu, or a mix.

Extract and return a JSON object with EXACTLY this structure (no extra keys, no markdown):

{
  "call_category": "string — one of: Complaint, Inquiry, Claim, Returns, Billing, Delivery, Technical Support, Feedback, Escalation, Other",
  "call_subcategory": "string — more specific topic e.g. 'Workshop Change Request', 'Claim Closure Query'",
  "call_outcome": "string — one of: Resolved, Unresolved, Escalated, Transferred, Pending, Abandoned",
  "customer_sentiment": {
    "overall": "string — one of: Positive, Neutral, Negative, Mixed",
    "score": number between -1.0 (very negative) and 1.0 (very positive),
    "emotions": ["array of detected emotions e.g. Frustrated, Confused, Satisfied, Angry, Calm"]
  },
  "agent_sentiment": {
    "overall": "string — one of: Empathetic, Professional, Robotic, Frustrated, Dismissive",
    "score": number between -1.0 and 1.0,
    "tone_consistency": "string — one of: Consistent, Inconsistent"
  },
  "top_complaints": ["array of up to 5 specific complaint phrases or issues raised by the customer, extracted verbatim or paraphrased clearly"],
  "signal_intelligence": {
    "threat_detected": boolean,
    "threat_details": "string or null — describe any legal threat, chargeback threat, violence threat",
    "social_media_mention": boolean,
    "social_media_details": "string or null — e.g. 'Customer mentioned posting on Facebook'",
    "escalation_request": boolean,
    "escalation_details": "string or null — e.g. 'Customer asked to speak to manager'",
    "regulatory_mention": boolean,
    "regulatory_details": "string or null — e.g. 'Customer mentioned SECP, consumer court, ombudsman'"
  },
  "key_moments": [
    {
      "timestamp": "string — HH:MM from transcript",
      "type": "string — one of: Escalation, Resolution Attempt, Customer Complaint, Dead Air, Hold, Agent Error, Positive Turn, Closing",
      "description": "string — brief description of what happened"
    }
  ],
  "location_mentioned": "string or null — city, area, or region mentioned by customer",
  "product_mentions": ["array of specific products, models, SKUs, or services mentioned"],
  "talk_time": {
    "customer_pct": number — estimated % of conversation time by customer,
    "agent_pct": number — estimated % of conversation time by agent
  },
  "summary": "string — 2-3 sentence plain English summary of the call"
}
`;

function smartTruncate(text, max = 2000) {
  if (!text || text.length <= max) return text;
  return text.slice(0, 1500) + '\n...\n' + text.slice(-500);
}

async function extractInsights(transcriptText, industry = 'generic') {
  if (!transcriptText || transcriptText.trim().length < 50) throw new Error('Transcript too short');
  transcriptText = smartTruncate(transcriptText);

  const industryContext = getIndustryPrompt(industry);
  const fullPrompt = EXTRACTION_PROMPT + industryContext + '\nTranscript:\n' + transcriptText;

  const accessToken = await getAccessToken();

  const response = await fetch(VERTEX_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Vertex AI error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('No response from Vertex AI');

  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const lastBrace = clean.lastIndexOf('}');
    if (lastBrace > 0) {
      return JSON.parse(clean.slice(0, lastBrace + 1));
    }
    throw e;
  }
}

async function processCallInsights(callId, tenantId, transcriptText, industry = 'generic') {
  try {
    const insights = await extractInsights(transcriptText, industry);

    await db.query(`
      INSERT INTO call_insights (
        call_id, tenant_id,
        call_category, call_subcategory, call_outcome,
        customer_sentiment_overall, customer_sentiment_score, customer_emotions,
        agent_sentiment_overall, agent_sentiment_score, agent_tone_consistency,
        top_complaints,
        threat_detected, threat_details,
        social_media_mention, social_media_details,
        escalation_request, escalation_details,
        regulatory_mention, regulatory_details,
        key_moments,
        location_mentioned,
        product_mentions,
        customer_talk_pct, agent_talk_pct,
        summary,
        processed_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,NOW()
      )
      ON CONFLICT (call_id) DO UPDATE SET
        call_category=EXCLUDED.call_category,
        call_subcategory=EXCLUDED.call_subcategory,
        call_outcome=EXCLUDED.call_outcome,
        customer_sentiment_overall=EXCLUDED.customer_sentiment_overall,
        customer_sentiment_score=EXCLUDED.customer_sentiment_score,
        customer_emotions=EXCLUDED.customer_emotions,
        agent_sentiment_overall=EXCLUDED.agent_sentiment_overall,
        agent_sentiment_score=EXCLUDED.agent_sentiment_score,
        agent_tone_consistency=EXCLUDED.agent_tone_consistency,
        top_complaints=EXCLUDED.top_complaints,
        threat_detected=EXCLUDED.threat_detected,
        threat_details=EXCLUDED.threat_details,
        social_media_mention=EXCLUDED.social_media_mention,
        social_media_details=EXCLUDED.social_media_details,
        escalation_request=EXCLUDED.escalation_request,
        escalation_details=EXCLUDED.escalation_details,
        regulatory_mention=EXCLUDED.regulatory_mention,
        regulatory_details=EXCLUDED.regulatory_details,
        key_moments=EXCLUDED.key_moments,
        location_mentioned=EXCLUDED.location_mentioned,
        product_mentions=EXCLUDED.product_mentions,
        customer_talk_pct=EXCLUDED.customer_talk_pct,
        agent_talk_pct=EXCLUDED.agent_talk_pct,
        summary=EXCLUDED.summary,
        processed_at=NOW()
    `, [
      callId, tenantId,
      insights.call_category, insights.call_subcategory, insights.call_outcome,
      insights.customer_sentiment?.overall, insights.customer_sentiment?.score,
      JSON.stringify(insights.customer_sentiment?.emotions || []),
      insights.agent_sentiment?.overall, insights.agent_sentiment?.score,
      insights.agent_sentiment?.tone_consistency,
      JSON.stringify(insights.top_complaints || []),
      insights.signal_intelligence?.threat_detected || false,
      insights.signal_intelligence?.threat_details || null,
      insights.signal_intelligence?.social_media_mention || false,
      insights.signal_intelligence?.social_media_details || null,
      insights.signal_intelligence?.escalation_request || false,
      insights.signal_intelligence?.escalation_details || null,
      insights.signal_intelligence?.regulatory_mention || false,
      insights.signal_intelligence?.regulatory_details || null,
      JSON.stringify(insights.key_moments || []),
      insights.location_mentioned || null,
      JSON.stringify(insights.product_mentions || []),
      insights.talk_time?.customer_pct || null,
      insights.talk_time?.agent_pct || null,
      insights.summary || null
    ]);

    return { success: true, callId };
  } catch (e) {
    await db.query(
      `INSERT INTO call_insights (call_id, tenant_id, error, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (call_id) DO UPDATE SET error=$3, processed_at=NOW()`,
      [callId, tenantId, e.message]
    );
    return { success: false, callId, error: e.message };
  }
}

// Process all unprocessed calls with transcripts for a tenant
async function processBatchInsights(tenantId, batchId, concurrency = 10) {
  // Fetch tenant's industry for industry-aware prompt injection
  const tenantRes = await db.query('SELECT industry FROM tenants WHERE id = $1', [tenantId]);
  const industry = tenantRes.rows[0]?.industry || 'generic';

  const { rows } = await db.query(`
    SELECT c.id AS call_id, ct.transcription_text, ct.translation_text
    FROM calls c
    JOIN call_transcripts ct ON ct.call_id = c.id
    LEFT JOIN call_insights ci ON ci.call_id = c.id
    WHERE c.tenant_id = $1
      AND ($2::uuid IS NULL OR c.batch_id = $2)
      AND (ci.call_id IS NULL OR ci.error IS NOT NULL)
  `, [tenantId, batchId || null]);

  if (!rows.length) return { processed: 0, errors: 0 };

  let processed = 0, errors = 0;

  // Process in chunks to respect rate limits
  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map(r => {
      // Prefer translation (English) if available, else use transcription
      const text = r.translation_text || r.transcription_text;
      return processCallInsights(r.call_id, tenantId, text, industry);
    }));
    results.forEach(r => r.success ? processed++ : errors++);
    // Small delay between chunks to avoid rate limits
    if (i + concurrency < rows.length) await new Promise(r => setTimeout(r, 200));
  }

  const result = { processed, errors, total: rows.length };

  // Fire alert email after batch completes (non-blocking, won't fail the batch)
  sendBatchAlerts(tenantId, batchId || null, null).catch(e =>
    console.error('[alerts] sendBatchAlerts error:', e.message)
  );

  return result;
}

module.exports = { processCallInsights, processBatchInsights, extractInsights };
