require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const app     = express();

// ── Body parsers (une seule fois) ─────────────────────────
app.use(cors());
app.use(express.text());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────
const authRoutes     = require('./routes/auth');
const launcherRoutes = require('./routes/launcher');
const adminRoutes    = require('./routes/admin');
const radioRoutes    = require('./routes/radio');

app.use('/v2',       authRoutes);      // POST /v2/auth, /v2/reauth, /v2/register
app.use('/launcher', launcherRoutes);  // GET  /launcher/home, /launcher/versions, ...
app.use('/admin',    adminRoutes);     // GET/POST/PATCH/DELETE /admin/*
app.use('/radio',    radioRoutes);     // GET  /radio/api, /radio/stream

// ── Health check ──────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0', name: 'NG Launcher API' });
});

// ── 404 catch-all ─────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable', path: req.path });
});

// ── Erreur globale ────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('[Global Error]', err);
    res.status(500).json({ error: 'Erreur serveur interne' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ API démarrée sur le port ${PORT}`);
});

module.exports = app;
