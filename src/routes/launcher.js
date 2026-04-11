const express = require('express');
const router  = express.Router();
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /launcher/home
router.get('/home', requireAuth, (req, res) => {
    try {
        const video = {
            url:       process.env.VIDEO_URL       || '',
            thumbnail: process.env.VIDEO_THUMBNAIL || ''
        };

        const alertRow = db.prepare(
            "SELECT * FROM launcher_alerts WHERE active = 1 ORDER BY id DESC LIMIT 1"
        ).get();
        const alert = alertRow
            ? { alert: true,  message: alertRow.message, type: alertRow.type || 'infos' }
            : { alert: false, message: '',               type: 'infos' };

        const newsRow = db.prepare(
            "SELECT * FROM launcher_news WHERE active = 1 AND type = 'article' ORDER BY created_at DESC LIMIT 1"
        ).get();
        const article = newsRow ? {
            title: newsRow.title, description: newsRow.description || '',
            thumbnail: newsRow.thumbnail || '', url: newsRow.url || '',
            tags: newsRow.tags || '', date: newsRow.created_at
        } : {
            title: 'Bienvenue !', description: 'Le launcher est opérationnel.',
            thumbnail: '', url: '', tags: 'news', date: new Date().toISOString()
        };

        const patchnote  = { link: process.env.PATCHNOTE_URL || 'https://github.com' };
        const playerCount = db.prepare(
            "SELECT COUNT(DISTINCT user_id) as count FROM tokens WHERE expires_at > datetime('now')"
        ).get();
        const players = { players: playerCount.count || 0 };
        const versionsRows = db.prepare(
            "SELECT name FROM launcher_versions WHERE active = 1 ORDER BY id ASC"
        ).all();
        const versions = { tags: versionsRows.map(v => v.name) };

        return res.json([video, alert, article, patchnote, players, versions]);
    } catch (err) {
        console.error('[launcher/home]', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /launcher/versions
router.get('/versions', requireAuth, (req, res) => {
    const versions = db.prepare("SELECT name FROM launcher_versions WHERE active = 1").all();
    return res.json(versions.map(v => v.name));
});

// GET /launcher/players (public)
router.get('/players', (req, res) => {
    const count = db.prepare(
        "SELECT COUNT(DISTINCT user_id) as count FROM tokens WHERE expires_at > datetime('now')"
    ).get();
    return res.json({ players: count.count || 0 });
});

// GET /launcher/getNotifications
router.get('/getNotifications', requireAuth, (req, res) => res.json({}));

// GET /launcher/updateNotifications
router.get('/updateNotifications', (req, res) => res.json({ ok: true }));

// ── Logique skins partagée ────────────────────────────────
function handleSkins(req, res) {
    const { action, selectedskin, skinname, skinfile } = req.body;
    const userId = req.user.user_id;
    try {
        if (action === 'getlist') {
            const skins = db.prepare(
                "SELECT skin_id, skin_name, skin_file, selected FROM skins WHERE user_id = ? ORDER BY created_at DESC"
            ).all(userId);
            return res.json(skins.length === 0 ? [] : skins);
        }
        if (action === 'addSkin') {
            if (!skinname) return res.json({ error: 'missing_params', description: 'skinname requis' });
            const skinId = require('crypto').randomUUID();
            db.prepare("INSERT INTO skins (user_id, skin_id, skin_name, skin_file) VALUES (?, ?, ?, ?)")
              .run(userId, skinId, skinname, skinfile || null);
            return res.json('');
        }
        if (action === 'deleteskin') {
            if (!selectedskin) return res.json({ error: 'missing_params', description: 'selectedskin requis' });
            db.prepare("DELETE FROM skins WHERE skin_id = ? AND user_id = ?").run(selectedskin, userId);
            return res.json('');
        }
        if (action === 'selectSkin') {
            if (!selectedskin) return res.json({ error: 'missing_params', description: 'selectedskin requis' });
            db.prepare("UPDATE skins SET selected = 0 WHERE user_id = ?").run(userId);
            db.prepare("UPDATE skins SET selected = 1 WHERE skin_id = ? AND user_id = ?").run(selectedskin, userId);
            return res.json('');
        }
        return res.json({ error: 'unknown_action' });
    } catch (err) {
        console.error('[launcher/skins]', err);
        return res.status(500).json({ error: 'server_error' });
    }
}

router.post('/skins', requireAuth, handleSkins);
router.get('/skins', (req, res, next) => { req.body = { ...req.query }; next(); }, requireAuth, handleSkins);

module.exports = router;
