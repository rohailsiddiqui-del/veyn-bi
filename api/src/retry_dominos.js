process.env.GOOGLE_APPLICATION_CREDENTIALS = '/home/simplyrms/service-account.json';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { processBatchInsights } = require('./services/insights');

(async () => {
  const tenants = [
    { id: 'd2330e4b-f244-4409-aae5-bcc4ba2a30c5', name: 'Dominos - Order Taking' },
    { id: '5b301f67-9dcd-4795-91d8-2cdf5b81b14e', name: 'Dominos - Complaint Inbound' },
    { id: 'ee019629-ef5e-4b43-9fa5-27398311c85d', name: 'Dominos - Complaint Outbound' },
  ];
  for (const t of tenants) {
    console.log(`Processing ${t.name}...`);
    const r = await processBatchInsights(t.id, null, 3);
    console.log(`  ${t.name}: ${r.processed} ok, ${r.errors} errors`);
  }
  process.exit(0);
})();
