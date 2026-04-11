const express = require('express');
const router  = express.Router();
const { db }  = require('../db');
const { requireAuth } = require('../middleware/auth');

// ── GET /launcher/home ────────────────────────────────────
router.get('/home', requireAuth, async (req, res) => {
    try {
        const video = {
            url:       process.env.VIDEO_URL       || '',
            thumbnail: process.env.VIDEO_THUMBNAIL || ''
        };

        const alertRow = await db.get(
            "SELECT * FROM launcher_alerts WHERE active = 1 ORDER BY id DESC LIMIT 1"
        );
        const alert = alertRow
            ? { alert: true,  message: alertRow.message, type: alertRow.type || 'infos' }
            : { alert: false, message: '', type: 'infos' };

        const newsRow = await db.get(
            "SELECT * FROM launcher_news WHERE active = 1 AND type = 'article' ORDER BY created_at DESC LIMIT 1"
        );
        const article = newsRow ? {
            title: newsRow.title, description: newsRow.description || '',
            thumbnail: newsRow.thumbnail || '', url: newsRow.url || '',
            tags: newsRow.tags || '', date: newsRow.created_at
        } : {
            title: 'Bienvenue !', description: 'Le launcher est opérationnel.',
            thumbnail: '', url: '', tags: 'news', date: new Date().toISOString()
        };

        const patchnote    = { link: process.env.PATCHNOTE_URL || 'https://github.com' };
        const playerCount  = await db.get(
            "SELECT COUNT(DISTINCT user_id) as count FROM tokens WHERE expires_at > NOW()::text OR expires_at IS NULL"
        );
        const players = { players: parseInt(playerCount?.count) || 0 };

        // Modpacks visibles par cet utilisateur (par rôle OU par accès direct)
        const userId   = req.user.user_id;
        const userRole = req.user.role;

        const visibleModpacks = await db.all(`
            SELECT DISTINCT m.name, m.display_name, m.background_url
            FROM modpacks m
            LEFT JOIN modpack_roles mr ON mr.modpack_id = m.id
            LEFT JOIN modpack_users mu ON mu.modpack_id = m.id
            WHERE m.active = 1
              AND (mr.role = $1 OR mu.user_id = $2)
            ORDER BY m.id ASC
        `, [userRole, userId]);

        const versions = { tags: visibleModpacks.map(m => m.name) };

        // Fond d'écran du modpack actuel (envoyé en bonus)
        const backgrounds = {};
        visibleModpacks.forEach(m => {
            if (m.background_url) backgrounds[m.name] = m.background_url;
        });

        return res.json([video, alert, article, patchnote, players, versions, { backgrounds }]);

    } catch (err) {
        console.error('[launcher/home]', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── GET /launcher/versions ────────────────────────────────
router.get('/versions', requireAuth, async (req, res) => {
    const userId   = req.user.user_id;
    const userRole = req.user.role;
    const modpacks = await db.all(`
        SELECT DISTINCT m.name FROM modpacks m
        LEFT JOIN modpack_roles mr ON mr.modpack_id = m.id
        LEFT JOIN modpack_users mu ON mu.modpack_id = m.id
        WHERE m.active = 1 AND (mr.role = $1 OR mu.user_id = $2)
        ORDER BY m.id ASC
    `, [userRole, userId]);
    return res.json(modpacks.map(m => m.name));
});

// ── GET /launcher/background/:modpack ────────────────────
// Retourne le fond d'écran d'un modpack spécifique
router.get('/background/:modpack', requireAuth, async (req, res) => {
    const userId   = req.user.user_id;
    const userRole = req.user.role;
    const modpack  = await db.get(`
        SELECT DISTINCT m.background_url FROM modpacks m
        LEFT JOIN modpack_roles mr ON mr.modpack_id = m.id
        LEFT JOIN modpack_users mu ON mu.modpack_id = m.id
        WHERE m.active = 1 AND m.name = $1
          AND (mr.role = $2 OR mu.user_id = $3)
    `, [req.params.modpack, userRole, userId]);

    if (!modpack) return res.status(404).json({ error: 'Modpack introuvable' });
    return res.json({ background_url: modpack.background_url || '' });
});

// ── GET /proxy_images/launcher ───────────────────────────
// Fond d'écran par défaut du launcher (configurable via .env)
router.get('/../../proxy_images/launcher', (req, res) => {
    const url = process.env.LAUNCHER_BACKGROUND_URL;
    if (!url) return res.status(404).json({ error: 'Aucun fond configuré' });
    return res.redirect(url);
});

// ── GET /launcher/players (public) ───────────────────────
router.get('/players', async (req, res) => {
    const count = await db.get(
        "SELECT COUNT(DISTINCT user_id) as count FROM tokens WHERE expires_at > NOW()::text OR expires_at IS NULL"
    );
    return res.json({ players: parseInt(count?.count) || 0 });
});

router.get('/getNotifications',    requireAuth, (req, res) => res.json({}));
router.get('/updateNotifications', (req, res) => res.json({ ok: true }));

// ── GET /launcher/getMoreMods ─────────────────────────────
// Route manquante : retourne la liste complète des modpacks visibles
router.get('/getMoreMods', requireAuth, async (req, res) => {
    try {
        const userId   = req.user.user_id;
        const userRole = req.user.role;
        const modpacks = await db.all(`
            SELECT DISTINCT m.name, m.display_name, m.description, m.background_url
            FROM modpacks m
            LEFT JOIN modpack_roles mr ON mr.modpack_id = m.id
            LEFT JOIN modpack_users mu ON mu.modpack_id = m.id
            WHERE m.active = 1
              AND (mr.role = $1 OR mu.user_id = $2)
            ORDER BY m.id ASC
        `, [userRole, userId]);
        return res.json(modpacks);
    } catch (err) {
        console.error('[launcher/getMoreMods]', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── GET /launcher/current_live2 ───────────────────────────
// Route manquante : retourne les infos live actuelles
router.get('/current_live2', async (req, res) => {
    try {
        const newsRow = await db.get(
            "SELECT * FROM launcher_news WHERE active = 1 AND type = 'live' ORDER BY created_at DESC LIMIT 1"
        );
        if (!newsRow) return res.json({ live: false });
        return res.json({
            live:      true,
            title:     newsRow.title,
            url:       newsRow.url       || '',
            thumbnail: newsRow.thumbnail || '',
            date:      newsRow.created_at
        });
    } catch (err) {
        console.error('[launcher/current_live2]', err);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ── Skins ─────────────────────────────────────────────────
async function handleSkins(req, res) {
    const { action, selectedskin, skinname, skinfile } = req.body;
    const userId = req.user.user_id;
    try {
        if (action === 'getlist') {
            const skins = await db.all(
                "SELECT skin_id, skin_name, skin_file, selected FROM skins WHERE user_id = $1 ORDER BY created_at DESC",
                [userId]
            );
            return res.json(skins.length === 0 ? [] : skins);
        }
        if (action === 'addSkin') {
            if (!skinname) return res.json({ error: 'missing_params' });
            const skinId = require('crypto').randomUUID();
            await db.run(
                "INSERT INTO skins (user_id, skin_id, skin_name, skin_file) VALUES ($1,$2,$3,$4)",
                [userId, skinId, skinname, skinfile || null]
            );
            return res.json('');
        }
        if (action === 'deleteskin') {
            if (!selectedskin) return res.json({ error: 'missing_params' });
            await db.run("DELETE FROM skins WHERE skin_id = $1 AND user_id = $2", [selectedskin, userId]);
            return res.json('');
        }
        if (action === 'selectSkin') {
            if (!selectedskin) return res.json({ error: 'missing_params' });
            await db.run("UPDATE skins SET selected = 0 WHERE user_id = $1", [userId]);
            await db.run("UPDATE skins SET selected = 1 WHERE skin_id = $1 AND user_id = $2", [selectedskin, userId]);
            return res.json('');
        }
        return res.json({ error: 'unknown_action' });
    } catch (err) {
        console.error('[launcher/skins]', err);
        return res.status(500).json({ error: 'server_error' });
    }
}

// GET /launcher/skin-render/:skinId
router.get('/skin-render/:skinId', requireAuth, async (req, res) => {
    const userId = req.user.user_id;
    const skin = await db.get(
        "SELECT skin_file FROM skins WHERE skin_id = $1 AND user_id = $2",
        [req.params.skinId, userId]
    );
    if (!skin || !skin.skin_file) return res.status(404).json({ error: 'Skin not found' });

    // Enlève le préfixe data:image/png;base64,
    const base64 = skin.skin_file.includes(',') ? skin.skin_file.split(',')[1] : skin.skin_file;
    const buffer = Buffer.from(base64, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buffer);
});

router.post('/skins', requireAuth, handleSkins);
router.get('/skins', (req, res, next) => { req.body = { ...req.query }; next(); }, requireAuth, handleSkins);

module.exports = router;

// ── POST /launcher/uploadScreen ───────────────────────────
// Route manquante : upload de screenshot (stub fonctionnel)
router.post('/uploadScreen', requireAuth, async (req, res) => {
    // Implémentation basique : retourne succès
    // À compléter selon vos besoins de stockage
    return res.json({ ok: true, message: 'Screenshot reçu' });
});

// ── POST /launcher/uploadCrash ────────────────────────────
// Route manquante : upload de crash report (stub fonctionnel)
router.post('/uploadCrash', async (req, res) => {
    // Implémentation basique : retourne succès
    return res.json({ ok: true, message: 'Crash report reçu' });
});
