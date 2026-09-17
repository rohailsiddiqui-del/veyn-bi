const { parse } = require('csv-parse/sync');
const db = require('../db');

const META_COLS = new Set([
  'name','duration','cli','disposition','dialer',
  'upload date & time','call date & time','status','score'
]);

function parseDuration(str) {
  if (!str) return 0;
  const parts = str.trim().split(':');
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return 0;
}

function parseDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0'));
  const d = new Date(str);
  return isNaN(d) ? null : d;
}

async function ingestCSVs(tenantId, batchId, evalText, transText, batchDirection = null) {
  const evalRows = evalText ? parse(evalText, { columns: true, skip_empty_lines: true, bom: true }) : [];
  const transRows = transText ? parse(transText, { columns: true, skip_empty_lines: true, bom: true }) : [];

  // Build transcript lookup
  const transMap = {};
  for (const r of transRows) {
    const key = (r.file_name || r.cri_id || '').trim();
    if (key) transMap[key] = r;
  }

  // Detect param columns
  const sampleRow = evalRows[0] || {};
  const paramCols = Object.keys(sampleRow).filter(k => !META_COLS.has(k.toLowerCase()));

  let inserted = 0;
  const errors = [];

  for (const row of evalRows) {
    try {
      const callRef = (row['CLI'] || row['cli'] || row['file_name'] || '').trim();
      const agentName = (row['Name'] || row['name'] || '').trim();
      const callDate = parseDate(row['Call Date & Time'] || row['call_date'] || '');
      const duration = parseDuration(row['Duration'] || row['duration'] || '');
      const status = (row['Status'] || row['status'] || '').trim();
      const score = parseFloat(row['SCORE'] || row['score'] || 0);
      const branchName = (row['Branch'] || row['branch'] || row['Branch Name'] || row['branch_name'] || '').trim() || null;
      const direction = batchDirection === 'mixed'
        ? (callRef.toLowerCase().includes('outbound') ? 'outbound' : 'inbound')
        : (batchDirection || (callRef.toLowerCase().includes('outbound') ? 'outbound' : 'inbound'));

      // Match transcript
      const transMatch = transMap[callRef] || Object.values(transMap).find(t =>
        t.file_name && (t.file_name.includes(callRef) || callRef.includes(t.file_name))
      );
      const hasTranscript = !!transMatch;

      const callRes = await db.query(
        `INSERT INTO calls
          (tenant_id, batch_id, call_ref, agent_name, call_date, call_duration_seconds, direction, status, score, has_transcript, branch_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, call_ref) DO NOTHING
         RETURNING id`,
        [tenantId, batchId, callRef, agentName, callDate, duration, direction, status, score, hasTranscript, branchName]
      );
      if (!callRes.rows[0]) continue; // duplicate — skip transcript + param inserts
      const callId = callRes.rows[0].id;

      // Param scores
      for (const col of paramCols) {
        const val = parseFloat(row[col]);
        if (!isNaN(val)) {
          await db.query(
            'INSERT INTO call_param_scores (call_id, tenant_id, param_name, score) VALUES ($1,$2,$3,$4)',
            [callId, tenantId, col, val]
          );
        }
      }

      // Transcript
      if (hasTranscript) {
        await db.query(
          'INSERT INTO call_transcripts (call_id, tenant_id, translation_text, transcription_text) VALUES ($1,$2,$3,$4)',
          [callId, tenantId, transMatch.formatted_translation || null, transMatch.formatted_transcription || null]
        );
      }

      inserted++;
    } catch (e) {
      errors.push(e.message);
    }
  }

  await db.query(
    'UPDATE upload_batches SET total_calls=$1, status=$2, processed_at=NOW() WHERE id=$3',
    [inserted, 'done', batchId]
  );

  return { inserted, paramCols, errors: errors.slice(0, 10) };
}

module.exports = { ingestCSVs };
