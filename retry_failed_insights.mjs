/**
 * Retry failed Logo Shoes call insights — one by one, 3s delay, robust JSON repair
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('./api/node_modules/pg');
const { GoogleAuth } = require('./api/node_modules/google-auth-library');
const pool = new Pool({ host: 'localhost', port: 5432, database: 'veyn_bi', user: 'veyn_bi', password: 'veyn_bi_2026' });

const VERTEX_PROJECT  = 'veyn-whatsapp-bot';
const VERTEX_LOCATION = 'us-central1';
const MODEL           = 'gemini-2.5-flash';
const TENANT_ID       = '64030e24-df62-4357-ab0c-087ece964daf';
const DELAY_MS        = 3000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let _auth = null;
async function getToken() {
  if (!_auth) _auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const c = await _auth.getClient();
  return (await c.getAccessToken()).token;
}

// Repair truncated JSON — close open strings, arrays, objects
function repairJson(raw) {
  // Try direct parse first
  try { return JSON.parse(raw); } catch {}

  // Try slicing to last complete closing brace
  const lastBrace = raw.lastIndexOf('}');
  if (lastBrace > 0) {
    const candidate = raw.slice(0, lastBrace + 1);
    try { return JSON.parse(candidate); } catch {}
  }

  // More aggressive: close any open string, then arrays, then object
  let s = raw.trimEnd();

  // If ends mid-string (no closing quote after last open quote on last line)
  if (s.match(/"[^"]*$/)) {
    s += '"';
  }

  // Close open arrays (count [ vs ])
  const opens = (s.match(/\[/g) || []).length;
  const closes = (s.match(/\]/g) || []).length;
  for (let i = 0; i < opens - closes; i++) s += ']';

  // Close open objects
  const oOpens = (s.match(/\{/g) || []).length;
  const oCloses = (s.match(/\}/g) || []).length;
  for (let i = 0; i < oOpens - oCloses; i++) s += '}';

  try { return JSON.parse(s); } catch {}

  // Strip to last complete field — find last complete "key": value pattern
  const lastComma = s.lastIndexOf(',');
  if (lastComma > 0) {
    const trimmed = s.slice(0, lastComma);
    const o2 = (trimmed.match(/\{/g) || []).length;
    const c2 = (trimmed.match(/\}/g) || []).length;
    let fixed = trimmed;
    for (let i = 0; i < o2 - c2; i++) fixed += '}';
    try { return JSON.parse(fixed); } catch {}
  }

  return null;
}

const PROMPT = `You are a call center intelligence analyst. Analyze the following call transcript.

Extract and return a JSON object with EXACTLY this structure (no extra keys, no markdown):

{
  "call_category": "one of: Complaint, Inquiry, Claim, Returns, Billing, Delivery, Technical Support, Feedback, Escalation, Other",
  "call_subcategory": "more specific topic",
  "call_outcome": "one of: Resolved, Unresolved, Escalated, Transferred, Pending, Abandoned",
  "customer_sentiment": {
    "overall": "one of: Positive, Neutral, Negative, Mixed",
    "score": 0.0,
    "emotions": ["array of detected emotions — keep SHORT, max 3 items"]
  },
  "agent_sentiment": {
    "overall": "one of: Empathetic, Professional, Robotic, Frustrated, Dismissive",
    "score": 0.0,
    "tone_consistency": "one of: Consistent, Inconsistent"
  },
  "top_complaints": ["max 3 complaints"],
  "signal_intelligence": {
    "threat_detected": false,
    "threat_details": null,
    "social_media_mention": false,
    "social_media_details": null,
    "escalation_request": false,
    "escalation_details": null,
    "regulatory_mention": false,
    "regulatory_details": null
  },
  "key_moments": [{"timestamp": "00:00", "type": "Closing", "description": "brief"}],
  "location_mentioned": null,
  "product_mentions": ["max 3 items"],
  "talk_time": {"customer_pct": 50, "agent_pct": 50},
  "summary": "2-3 sentence summary"
}

IMPORTANT: Keep arrays SHORT (max 3 items each). Return ONLY valid JSON — no markdown, no explanation.

Transcript:
`;

async function processCall(callId, transcript) {
  const token = await getToken();

  const resp = await fetch(
    `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: PROMPT + transcript }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: 'application/json' },
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Vertex ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw new Error('No response from Vertex AI');

  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = repairJson(clean);
  if (!parsed) throw new Error(`JSON repair exhausted all strategies. Raw length: ${raw.length}. Raw preview: ${raw.slice(0, 200)}`);
  return parsed;
}

async function saveInsights(callId, ins) {
  await pool.query(`
    UPDATE call_insights SET
      call_category=$1, call_subcategory=$2, call_outcome=$3,
      customer_sentiment_overall=$4, customer_sentiment_score=$5, customer_emotions=$6,
      agent_sentiment_overall=$7, agent_sentiment_score=$8, agent_tone_consistency=$9,
      top_complaints=$10,
      threat_detected=$11, threat_details=$12,
      social_media_mention=$13, social_media_details=$14,
      escalation_request=$15, escalation_details=$16,
      regulatory_mention=$17, regulatory_details=$18,
      key_moments=$19, location_mentioned=$20, product_mentions=$21,
      customer_talk_pct=$22, agent_talk_pct=$23,
      summary=$24, error=NULL, processed_at=NOW()
    WHERE call_id=$25
  `, [
    ins.call_category, ins.call_subcategory, ins.call_outcome,
    ins.customer_sentiment?.overall, ins.customer_sentiment?.score,
    JSON.stringify((ins.customer_sentiment?.emotions || []).slice(0, 5)),
    ins.agent_sentiment?.overall, ins.agent_sentiment?.score, ins.agent_sentiment?.tone_consistency,
    JSON.stringify((ins.top_complaints || []).slice(0, 5)),
    ins.signal_intelligence?.threat_detected || false, ins.signal_intelligence?.threat_details || null,
    ins.signal_intelligence?.social_media_mention || false, ins.signal_intelligence?.social_media_details || null,
    ins.signal_intelligence?.escalation_request || false, ins.signal_intelligence?.escalation_details || null,
    ins.signal_intelligence?.regulatory_mention || false, ins.signal_intelligence?.regulatory_details || null,
    JSON.stringify((ins.key_moments || []).slice(0, 10)),
    ins.location_mentioned || null,
    JSON.stringify((ins.product_mentions || []).slice(0, 10)),
    ins.talk_time?.customer_pct || null, ins.talk_time?.agent_pct || null,
    ins.summary || null,
    callId,
  ]);
}

async function main() {
  console.log('🔄 Retrying failed Logo Shoes insights — one by one');
  console.log('='.repeat(55));

  // Fetch failed calls with transcripts
  const { rows } = await pool.query(`
    SELECT ci.call_id, ct.transcription_text, ct.translation_text
    FROM call_insights ci
    JOIN call_transcripts ct ON ct.call_id = ci.call_id
    WHERE ci.tenant_id = $1 AND ci.error IS NOT NULL
    ORDER BY ci.processed_at ASC
  `, [TENANT_ID]);

  console.log(`Found ${rows.length} failed calls to retry\n`);

  let ok = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const { call_id, transcription_text, translation_text } = rows[i];
    const text = translation_text || transcription_text || '';

    console.log(`[${i+1}/${rows.length}] Processing call ${call_id.slice(0, 8)}...`);

    // Retry with exponential backoff on 429
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ins = await processCall(call_id, text);
        await saveInsights(call_id, ins);
        console.log(`  ✅ OK — ${ins.call_category} / ${ins.call_outcome}`);
        ok++;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (err.message.includes('429') && attempt < 3) {
          const wait = attempt * 5000;
          console.log(`  ⚠️  Rate limit, waiting ${wait/1000}s...`);
          await sleep(wait);
        } else if (attempt < 3) {
          await sleep(2000);
        }
      }
    }

    if (lastErr) {
      console.log(`  ❌ Failed after 3 attempts: ${lastErr.message.slice(0, 100)}`);
      // Update error message to latest
      await pool.query(`UPDATE call_insights SET error=$1, processed_at=NOW() WHERE call_id=$2`,
        [lastErr.message, call_id]);
      failed++;
    }

    if (i < rows.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n${'='.repeat(55)}`);
  console.log(`✅ Succeeded: ${ok}`);
  console.log(`❌ Failed:    ${failed}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
