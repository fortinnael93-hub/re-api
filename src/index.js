require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const { initDB } = require('./db');
const app        = express();

app.use(cors());
app.use(express.text());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const authRoutes     = require('./routes/auth');
const launcherRoutes = require('./routes/launcher');
const adminRoutes    = require('./routes/admin');
const radioRoutes    = require('./routes/radio');

app.use('/v2',       authRoutes);
app.use('/launcher', launcherRoutes);
app.use('/admin',    adminRoutes);
app.use('/radio',    radioRoutes);

// Fond d'écran par défaut du launcher
app.get('/proxy_images/launcher', (req, res) => {
    const url = process.env.LAUNCHER_BACKGROUND_URL;
    if (!url) return res.status(404).json({ error: 'Aucun fond configuré' });
    return res.redirect(url);
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', version: '3.0.0', name: 'NG Launcher API' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable', path: req.path });
});

app.use((err, req, res, _next) => {
    console.error('[Global Error]', err);
    res.status(500).json({ error: 'Erreur serveur interne' });
});

const PORT = process.env.PORT || 3000;

initDB()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ API démarrée sur le port ${PORT}`);
        });
    })
    .catch(err => {
        console.error('❌ Erreur initialisation BDD:', err);
        process.exit(1);
    });

module.exports = app;
