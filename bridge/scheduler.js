/**
 * Veyn BI Bridge Scheduler
 * Runs bridge.js on a cron schedule (default: daily at 2:00 AM).
 * Start with: node scheduler.js  (or via PM2)
 */

const cron = require('node-cron');
const { execSync } = require('child_process');
const path = require('path');

const SCHEDULE = process.env.BRIDGE_SCHEDULE || '0 2 * * *'; // daily at 2:00 AM

console.log(`[scheduler] Starting — will run bridge on schedule: ${SCHEDULE}`);
console.log(`[scheduler] Time: ${new Date().toISOString()}`);

// Run once immediately on startup
runBridge();

cron.schedule(SCHEDULE, () => {
  console.log(`\n[scheduler] Cron triggered — ${new Date().toISOString()}`);
  runBridge();
});

function runBridge() {
  try {
    const bridgePath = path.join(__dirname, 'bridge.js');
    execSync(`node "${bridgePath}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error('[scheduler] Bridge run failed:', e.message);
  }
}
