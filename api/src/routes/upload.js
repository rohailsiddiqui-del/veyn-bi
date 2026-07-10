const router = require('express').Router();
const multer = require('multer');
const db = require('../db');
const { ingestCSVs } = require('../services/ingest');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Upload eval + transcript CSVs
router.post('/', upload.fields([{ name: 'eval' }, { name: 'trans' }]), async (req, res) => {
  const tenantId = req.user.tenantId;
  const batchName = req.body.batchName || `Batch ${new Date().toISOString().slice(0,10)}`;
  const direction = ['inbound','outbound','mixed'].includes(req.body.direction) ? req.body.direction : 'inbound';

  try {
    const evalFile = req.files['eval']?.[0];
    const transFile = req.files['trans']?.[0];

    if (!evalFile) return res.status(400).json({ error: 'Eval CSV is required' });

    const batchRes = await db.query(
      `INSERT INTO upload_batches (tenant_id, batch_name, eval_filename, trans_filename, status)
       VALUES ($1,$2,$3,$4,'processing') RETURNING id`,
      [tenantId, batchName, evalFile.originalname, transFile?.originalname || null]
    );
    const batchId = batchRes.rows[0].id;

    const evalText = evalFile.buffer.toString('utf-8');
    const transText = transFile ? transFile.buffer.toString('utf-8') : null;

    // Run ingestion async, respond immediately
    res.json({ message: 'Upload received, processing...', batchId });

    ingestCSVs(tenantId, batchId, evalText, transText, direction)
      .then(result => console.log(`Batch ${batchId}: ${result.inserted} calls ingested`))
      .catch(e => {
        console.error(`Batch ${batchId} error:`, e.message);
        db.query('UPDATE upload_batches SET status=$1 WHERE id=$2', ['error', batchId]);
      });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get batch status
router.get('/batches', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM upload_batches WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20',
      [req.user.tenantId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/batches/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM upload_batches WHERE id=$1 AND tenant_id=$2',
      [req.params.id, req.user.tenantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Batch not found' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
