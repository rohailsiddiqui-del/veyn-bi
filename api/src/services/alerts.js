const nodemailer = require('nodemailer');
const db = require('../db');

function createTransporter() {
  const host = process.env.ALERT_SMTP_HOST;
  const user = process.env.ALERT_SMTP_USER;
  const pass = process.env.ALERT_SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: parseInt(process.env.ALERT_SMTP_PORT || '587'),
    secure: false,
    auth: { user, pass }
  });
}

function formatCallRow(call) {
  const flags = [];
  if (call.threat_detected)    flags.push('⚠️ Threat');
  if (call.escalation_request) flags.push('🔺 Escalation');
  const flagStr = flags.join(', ');
  const date = call.call_date ? new Date(call.call_date).toLocaleDateString('en-GB') : '—';
  const details = (call.threat_details || call.escalation_details || '—').slice(0, 120);
  return `
    <tr style="border-bottom:1px solid #e2e8f0;">
      <td style="padding:10px 12px;font-family:monospace;font-size:12px;color:#475569;">${call.call_ref || String(call.call_id).slice(0,8)}</td>
      <td style="padding:10px 12px;font-size:13px;">${call.agent_name || '—'}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;">${date}</td>
      <td style="padding:10px 12px;font-size:12px;">${flagStr}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;max-width:260px;">${details}</td>
      <td style="padding:10px 12px;font-size:12px;color:#64748b;">${call.call_category || '—'}</td>
      <td style="padding:10px 12px;font-size:12px;">${call.score != null ? parseFloat(call.score).toFixed(1) : '—'}</td>
    </tr>`;
}

const TABLE_HEADER = `
  <thead>
    <tr>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Call Ref</th>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Agent</th>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Date</th>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Flags</th>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Details</th>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Category</th>
      <th style="padding:9px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Score</th>
    </tr>
  </thead>`;

function buildEmailHTML({ tenantName, batchName, threats, escalations, batchDate }) {
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://34.27.148.238:4000';
  const totalFlags = threats.length + escalations.length;

  // Escalations that aren't also threats (avoid duplicates in the escalation table)
  const threatIds = new Set(threats.map(c => c.call_id));
  const escalationsOnly = escalations.filter(c => !threatIds.has(c.call_id));

  const threatRows = threats.map(formatCallRow).join('');
  const escalationRows = escalationsOnly.map(formatCallRow).join('');

  const threatSection = threats.length === 0 ? '' : `
    <div style="margin-bottom:28px;">
      <div style="font-size:12px;font-weight:700;color:#991b1b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
        ⚠️ Threat Calls (${threats.length})
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:10px;">
        Customers who made explicit threats — consumer court, legal action, chargebacks, or other high-risk language.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #fca5a5;border-radius:8px;overflow:hidden;">
        ${TABLE_HEADER}
        <tbody>${threatRows}</tbody>
      </table>
    </div>`;

  const escalationSection = escalationsOnly.length === 0 ? '' : `
    <div style="margin-bottom:28px;">
      <div style="font-size:12px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">
        🔺 Escalation Calls (${escalationsOnly.length})
      </div>
      <div style="font-size:12px;color:#64748b;margin-bottom:10px;">
        Customers who requested manager escalation or supervisor intervention.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #fcd34d;border-radius:8px;overflow:hidden;">
        ${TABLE_HEADER}
        <tbody>${escalationRows}</tbody>
      </table>
    </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;margin:0;padding:24px;">
  <div style="max-width:860px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

    <div style="background:#1e293b;padding:22px 28px;">
      <div style="font-size:18px;font-weight:700;color:#a78bfa;">⚡ Veyn.ai</div>
      <div style="font-size:11px;color:#64748b;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">CX Intelligence Alert &nbsp;·&nbsp; ${tenantName}</div>
      <div style="font-size:11px;color:#475569;margin-top:4px;">${batchDate}${batchName ? ' &nbsp;·&nbsp; Batch: ' + batchName : ''}</div>
    </div>

    <div style="background:#fef2f2;border-bottom:2px solid #fca5a5;padding:16px 28px;display:flex;align-items:center;gap:14px;">
      <div style="font-size:26px;">⚠️</div>
      <div>
        <div style="font-size:15px;font-weight:700;color:#991b1b;">${totalFlags} Flagged Call${totalFlags !== 1 ? 's' : ''} Require Attention</div>
        <div style="font-size:13px;color:#dc2626;margin-top:2px;">
          ${threats.length} threat${threats.length !== 1 ? 's' : ''} &nbsp;&nbsp;·&nbsp;&nbsp; ${escalations.length} escalation${escalations.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>

    <div style="padding:24px 28px;">
      ${threatSection}
      ${escalationSection}

      <div style="text-align:center;margin-top:20px;padding-top:20px;border-top:1px solid #e2e8f0;">
        <a href="${dashboardUrl}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:11px 28px;border-radius:8px;font-size:14px;font-weight:600;">
          View Full Details in Dashboard →
        </a>
        <div style="font-size:11px;color:#94a3b8;margin-top:10px;">
          Go to Insights → Flagged Calls — filter by Threat or Escalation to backtrack each call with full transcript.
        </div>
      </div>
    </div>

    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:12px 28px;text-align:center;">
      <div style="font-size:11px;color:#94a3b8;">Veyn.ai CX Intelligence &nbsp;·&nbsp; Automated batch alert for ${tenantName}</div>
    </div>
  </div>
</body>
</html>`;
}

async function sendBatchAlerts(tenantId, batchId, batchName) {
  try {
    const tenantRes = await db.query(
      'SELECT name, alert_email, alert_signals, alerts_enabled FROM tenants WHERE id=$1',
      [tenantId]
    );
    const tenant = tenantRes.rows[0];
    if (!tenant || !tenant.alerts_enabled || !tenant.alert_email) {
      console.log('[alerts] Alerts disabled or no email configured for tenant:', tenantId);
      return;
    }

    const signals = tenant.alert_signals || ['threat', 'escalation'];
    let threats = [], escalations = [];

    if (signals.includes('threat')) {
      const res = await db.query(`
        SELECT ci.call_id, c.call_ref, c.agent_name, c.call_date, c.score,
               ci.threat_detected, ci.threat_details,
               ci.escalation_request, ci.escalation_details,
               ci.call_category, ci.call_outcome
        FROM call_insights ci
        JOIN calls c ON c.id = ci.call_id
        WHERE ci.tenant_id=$1 AND ci.threat_detected=true
          AND ($2::uuid IS NULL OR c.batch_id=$2)
        ORDER BY c.call_date DESC
      `, [tenantId, batchId || null]);
      threats = res.rows;
    }

    if (signals.includes('escalation')) {
      const res = await db.query(`
        SELECT ci.call_id, c.call_ref, c.agent_name, c.call_date, c.score,
               ci.threat_detected, ci.threat_details,
               ci.escalation_request, ci.escalation_details,
               ci.call_category, ci.call_outcome
        FROM call_insights ci
        JOIN calls c ON c.id = ci.call_id
        WHERE ci.tenant_id=$1 AND ci.escalation_request=true
          AND ($2::uuid IS NULL OR c.batch_id=$2)
        ORDER BY c.call_date DESC
      `, [tenantId, batchId || null]);
      escalations = res.rows;
    }

    if (!threats.length && !escalations.length) {
      console.log('[alerts] No flagged calls found — no email sent');
      return;
    }

    const transporter = createTransporter();
    if (!transporter) {
      console.warn('[alerts] SMTP not configured (ALERT_SMTP_USER/PASS missing) — skipping alert');
      return;
    }

    const batchDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const totalFlags = threats.length + escalations.length;
    const subject = `⚠️ ${totalFlags} Flagged Call${totalFlags !== 1 ? 's' : ''} — ${tenant.name} (${batchDate})`;
    const html = buildEmailHTML({ tenantName: tenant.name, batchName, threats, escalations, batchDate });

    const recipients = tenant.alert_email.split(',').map(e => e.trim()).filter(Boolean);
    await transporter.sendMail({
      from: `"${process.env.ALERT_FROM_NAME || 'Veyn BI Alerts'}" <${process.env.ALERT_SMTP_USER}>`,
      to: recipients.join(', '),
      subject,
      html
    });

    console.log(`[alerts] Sent to ${recipients.join(', ')} — ${threats.length} threats, ${escalations.length} escalations`);
  } catch (e) {
    console.error('[alerts] Failed to send alert email:', e.message);
  }
}

module.exports = { sendBatchAlerts };
