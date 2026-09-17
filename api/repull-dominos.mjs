/**
 * Re-pull Dominos data for Sep 10-11 across all 3 portals.
 * Uses pull-from-api endpoint with group admin token.
 */

const BASE = 'http://localhost:4000';
const EMAIL = 'admin@dominos.com';
const PASS  = 'Dominos@2026';

const PORTALS = [
  { name: 'Order Taking',       id: 'd2330e4b-f244-4409-aae5-bcc4ba2a30c5', direction: 'inbound' },
  { name: 'Complaint Inbound',  id: '5b301f67-9dcd-4795-91d8-2cdf5b81b14e', direction: 'inbound' },
  { name: 'Complaint Outbound', id: 'ee019629-ef5e-4b43-9fa5-27398311c85d', direction: 'outbound' },
];

const DATE_FROM = '2026-09-10';
const DATE_TO   = '2026-09-11';

// 1. Login
const loginRes = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
const { token } = await loginRes.json();
console.log('[dominos-repull] Logged in as', EMAIL);

// 2. Pull for each portal
for (const portal of PORTALS) {
  console.log(`\n[dominos-repull] Pulling ${portal.name} (${DATE_FROM} → ${DATE_TO})…`);
  const res = await fetch(`${BASE}/api/upload/pull-from-api`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      date_from:        DATE_FROM,
      date_to:          DATE_TO,
      direction:        portal.direction,
      batch_name:       `Sep 10-11 Repull`,
      portal_tenant_id: portal.id,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error(`  ERROR ${res.status}:`, data.error || data);
  } else {
    console.log(`  ✅ ${data.message} | batchId: ${data.batchId} | evalRows: ${data.evalRows}`);
  }

  // Wait 5s between pulls to not hammer the Voice App login
  if (portal !== PORTALS[PORTALS.length - 1]) {
    await new Promise(r => setTimeout(r, 5000));
  }
}

console.log('\n[dominos-repull] All pulls triggered. Ingestion + insights running in background.');
console.log('Check batches at http://34.27.148.238:5001 (Dominos login).');
