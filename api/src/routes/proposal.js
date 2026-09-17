const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const GENERATE_SCRIPT      = '/home/simplyrms/alex-hubspot/proposal-gen/generate.mjs';
const GENERATE_DOCX_SCRIPT = '/home/simplyrms/alex-hubspot/proposal-gen/generate-docx.mjs';
const OUTPUT_DIR = '/home/simplyrms/alex-hubspot/proposal-gen/output';
const PUBLIC_DIR = '/home/simplyrms/veyn-bi/proposals';
const SECRET = process.env.PROPOSAL_SECRET || 'alex-proposal-2026';

// POST /api/proposal/generate
// Body: { clientName, date, price, currency, dealId }
// Header: x-proposal-secret: <SECRET>
router.post('/generate', (req, res) => {
  const secret = req.headers['x-proposal-secret'];
  if (secret !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    clientName = 'Client',
    date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    price = '0',
    currency = 'CAD',
    dealId = null,
  } = req.body;

  if (!clientName || clientName.trim().length === 0) {
    return res.status(400).json({ error: 'clientName is required' });
  }

  try {
    // Run the generator
    execSync(`/usr/bin/node "${GENERATE_SCRIPT}"`, {
      env: {
        ...process.env,
        CLIENT_NAME: clientName,
        DATE: date,
        PRICE: price,
        CURRENCY: currency,
      },
      timeout: 120000,
    });

    // Find the latest PDF in output dir
    const files = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.startsWith('proposal-') && f.endsWith('.pdf'))
      .map(f => ({ name: f, time: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (!files.length) {
      return res.status(500).json({ error: 'PDF not generated' });
    }

    // Copy to public proposals folder
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    const slug = dealId
      ? `proposal-deal-${dealId}.pdf`
      : files[0].name;
    const destPath = path.join(PUBLIC_DIR, slug);
    fs.copyFileSync(path.join(OUTPUT_DIR, files[0].name), destPath);

    const url = `http://34.27.148.238:4000/proposals/${slug}`;
    console.log(`[proposal] Generated: ${url} for "${clientName}"`);

    return res.json({ success: true, url, filename: slug });
  } catch (err) {
    console.error('[proposal] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal/generate-docx
// Body: { clientName, date, price, currency, contactName, notes, dealId }
// Header: x-proposal-secret: <SECRET>
router.post('/generate-docx', (req, res) => {
  const secret = req.headers['x-proposal-secret'];
  if (secret !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const {
    clientName = 'Client',
    date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    price = '0',
    currency = 'CAD',
    contactName = '',
    notes = '',
    dealId = null,
  } = req.body;

  if (!clientName || clientName.trim().length === 0) {
    return res.status(400).json({ error: 'clientName is required' });
  }

  try {
    execSync(`/usr/bin/node "${GENERATE_DOCX_SCRIPT}"`, {
      env: {
        ...process.env,
        CLIENT_NAME: clientName,
        DATE: date,
        PRICE: price,
        CURRENCY: currency,
        CONTACT_NAME: contactName,
        NOTES: notes,
      },
      timeout: 120000,
    });

    // Find latest .docx in output dir
    const files = fs.readdirSync('/home/simplyrms/alex-hubspot/proposal-gen/output')
      .filter(f => f.startsWith('proposal-') && f.endsWith('.docx'))
      .map(f => ({ name: f, time: fs.statSync(path.join('/home/simplyrms/alex-hubspot/proposal-gen/output', f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (!files.length) return res.status(500).json({ error: 'DOCX not generated' });

    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    const slug = dealId
      ? `proposal-deal-${dealId}.docx`
      : `proposal-${clientName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.docx`;
    const destPath = path.join(PUBLIC_DIR, slug);
    fs.copyFileSync(path.join('/home/simplyrms/alex-hubspot/proposal-gen/output', files[0].name), destPath);

    const url = `http://34.27.148.238:4000/proposals/${slug}`;
    console.log(`[proposal-docx] Generated: ${url} for "${clientName}"`);
    return res.json({ success: true, url, filename: slug });
  } catch (err) {
    console.error('[proposal-docx] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
