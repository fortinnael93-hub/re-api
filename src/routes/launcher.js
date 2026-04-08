const express = require('express');
const router = express.Router();
const db = require('../db');

// ── Middleware auth token ─────────────────────────────────
function requireAuth(req, res, next) {
    const token = req.query.token || req.headers['x-auth-token'];
    if (!token) return res.status(401).json({ error: 'Token requis' });

    const tokenRow = db.prepare(`
        SELECT t.*, u.username, u.role, u.banned
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
    `).get(token);

    if (!tokenRow || tokenRow.banned) {
        return res.status(401).json({ error: 'Token invalide' });
    }

    req.user = tokenRow;
    next();
}

// ── GET /launcher/home  ───────────────────────────────────
// Retourne toutes les données de l'écran principal du launcher
// Format identique à l'API NationsGlory originale : tableau [alert, banner, article, patchnote, players, versions]
router.get('/home', requireAuth, (req, res) => {
    try {
        // [0] Vidéo / contenu haut
        const video = {
            url: '',
            thumbnail: ''
        };

        // [1] Alerte / bannière message
        const alert = {
            alert: false,
            message: '',
            type: 'infos' // 'infos', 'warning', 'danger'
        };

        // [2] Article (news principale)
        const newsRow = db.prepare(`
            SELECT * FROM launcher_news WHERE active = 1 AND type = 'article'
            ORDER BY created_at DESC LIMIT 1
        `).get();

        const article = newsRow ? {
            title: newsRow.title,
            description: newsRow.description || '',
            thumbnail: newsRow.thumbnail || '',
            url: newsRow.url || '',
            tags: newsRow.tags || '',
            date: newsRow.created_at
        } : {
            title: 'Bienvenue !',
            description: 'Le launcher est opérationnel.',
            thumbnail: '',
            url: '',
            tags: 'news',
            date: new Date().toISOString()
        };

        // [3] Patchnote / lien update
        const patchnote = {
            link: process.env.PATCHNOTE_URL || 'https://github.com'
        };

        // [4] Joueurs connectés
        const playerCount = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count FROM tokens
            WHERE expires_at > datetime('now')
        `).get();

        const players = {
            players: playerCount.count || 0
        };

        // [5] Versions disponibles
        const versionsRows = db.prepare(`
            SELECT name FROM launcher_versions WHERE active = 1 ORDER BY id ASC
        `).all();

        const versions = {
            tags: versionsRows.map(v => v.name)
        };

        // Réponse au format tableau (comme l'API originale)
        return res.json([video, alert, article, patchnote, players, versions]);

    } catch (err) {
        console.error('[launcher/home] Erreur:', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── GET /launcher/versions  ───────────────────────────────
router.get('/versions', requireAuth, (req, res) => {
    const versions = db.prepare('SELECT name, type FROM launcher_versions WHERE active = 1').all();
    return res.json(versions.map(v => v.name));
});

// ── GET /launcher/players  ────────────────────────────────
router.get('/players', (req, res) => {
    const count = db.prepare(`
        SELECT COUNT(DISTINCT user_id) as count FROM tokens
        WHERE expires_at > datetime('now')
    `).get();
    return res.json({ players: count.count || 0 });
});

// ── GET /launcher/getNotifications  ──────────────────────
router.get('/getNotifications', requireAuth, (req, res) => {
    // Pas de notification pour l'instant
    return res.json({});
});

// ── GET /launcher/updateNotifications  ───────────────────
router.get('/updateNotifications', (req, res) => {
    return res.json({ ok: true });
});

module.exports = router;
