require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const authRoutes = require('./routes/auth');
const launcherRoutes = require('./routes/launcher');
const adminRoutes = require('./routes/admin');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────
app.use('/v2', authRoutes);          // /v2/auth, /v2/reauth
app.use('/launcher', launcherRoutes); // /launcher/home, /launcher/versions
app.use('/admin', adminRoutes);       // /admin/users (gestion)

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', name: 'NG Launcher API' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ API démarrée sur le port ${PORT}`);
});

module.exports = app;
