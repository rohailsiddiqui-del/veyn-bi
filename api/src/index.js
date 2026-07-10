require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const auth = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Public routes
app.use('/api/auth', require('./routes/auth'));

// Protected routes
app.use('/api/upload',    auth, require('./routes/upload'));
app.use('/api/analytics', auth, require('./routes/analytics'));
app.use('/api/insights',  auth, require('./routes/insights'));
app.use('/api/chat',      auth, require('./routes/chat'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// Serve dashboard
app.use(express.static(path.join(__dirname, '../..')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../../dashboard.html')));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Veyn BI API running on port ${PORT}`));
