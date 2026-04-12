const express = require('express');
const router  = express.Router();
const { db }  = require('../db');
const { requireAuth } = require('../middleware/auth');
const axios   = require('axios');

const GITHUB_BASE = 'https://media.githubusercontent.com/media/fortinnael93-hub/modpack-relaunch/master';

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

        const patchnote   = { link: process.env.PATCHNOTE_URL || 'https://github.com' };
        const playerCount = await db.get(
            "SELECT COUNT(DISTINCT user_id) as count FROM tokens WHERE (expires_at IS NULL OR expires_at::timestamp > NOW())"
        );
        const players = { players: parseInt(playerCount?.count) || 0 };

        const userId   = req.user.user_id;
        const userRole = req.user.role;

        const visibleModpacks = await db.all(`
            SELECT DISTINCT m.id, m.name, m.display_name, m.background_url
            FROM modpacks m
            LEFT JOIN modpack_roles mr ON mr.modpack_id = m.id
            LEFT JOIN modpack_users mu ON mu.modpack_id = m.id
            WHERE m.active = 1
              AND (mr.role = $1 OR mu.user_id = $2)
            ORDER BY m.id ASC
        `, [userRole, userId]);

        const versions = { tags: visibleModpacks.map(m => m.name) };

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
        SELECT DISTINCT m.id, m.name FROM modpacks m
        LEFT JOIN modpack_roles mr ON mr.modpack_id = m.id
        LEFT JOIN modpack_users mu ON mu.modpack_id = m.id
        WHERE m.active = 1 AND (mr.role = $1 OR mu.user_id = $2)
        ORDER BY m.id ASC
    `, [userRole, userId]);
    return res.json(modpacks.map(m => m.name));
});

// ── GET /launcher/background/:modpack ────────────────────
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
router.get('/../../proxy_images/launcher', (req, res) => {
    const url = process.env.LAUNCHER_BACKGROUND_URL;
    if (!url) return res.status(404).json({ error: 'Aucun fond configuré' });
    return res.redirect(url);
});

// ── GET /launcher/players (public) ───────────────────────
router.get('/players', async (req, res) => {
    const count = await db.get(
        "SELECT COUNT(DISTINCT user_id) as count FROM tokens WHERE (expires_at IS NULL OR expires_at::timestamp > NOW())"
    );
    return res.json({ players: parseInt(count?.count) || 0 });
});

router.get('/getNotifications',    requireAuth, (req, res) => res.json({}));
router.get('/updateNotifications', (req, res) => res.json({ ok: true }));

// ── GET /launcher/getMoreMods ─────────────────────────────
router.get('/getMoreMods', requireAuth, async (req, res) => {
    try {
        const userId   = req.user.user_id;
        const userRole = req.user.role;
        const modpacks = await db.all(`
            SELECT DISTINCT m.id, m.name, m.display_name, m.description, m.background_url
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

    const base64 = skin.skin_file.includes(',') ? skin.skin_file.split(',')[1] : skin.skin_file;
    const buffer = Buffer.from(base64, 'base64');

    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(buffer);
});

router.post('/skins', requireAuth, handleSkins);
router.get('/skins', (req, res, next) => { req.body = { ...req.query }; next(); }, requireAuth, handleSkins);

// ── POST /launcher/uploadScreen ───────────────────────────
router.post('/uploadScreen', requireAuth, async (req, res) => {
    return res.json({ ok: true, message: 'Screenshot reçu' });
});

// ── POST /launcher/uploadCrash ────────────────────────────
router.post('/uploadCrash', async (req, res) => {
    return res.json({ ok: true, message: 'Crash report reçu' });
});

// ═══════════════════════════════════════════════════════════
// MODPACKS — Téléchargement via GitHub LFS
// ═══════════════════════════════════════════════════════════

// Manifest d'un modpack
router.get('/versions/:modpack/manifest_:name.json', requireAuth, async (req, res) => {
    const { modpack } = req.params;
    try {
        const url = `${GITHUB_BASE}/${modpack}/manifest_${modpack}.json`;
        const response = await axios.get(url);
        res.json(response.data);
    } catch (err) {
        console.error('[launcher/manifest]', err.message);
        res.status(404).json({ error: 'Manifest introuvable' });
    }
});

// Fichiers d'un modpack (mods, etc.)
router.get('/versions/:modpack/files/*', requireAuth, async (req, res) => {
    const { modpack } = req.params;
    const filePath = req.params[0];
    const url = `${GITHUB_BASE}/${modpack}/${filePath}`;
    res.redirect(url);
});

// ═════════════════════════════════════════════════════════════════════════════
// TWITCH
// ═════════════════════════════════════════════════════════════════════════════

const https = require('https');

let _twitchTokenCache = null;

async function getTwitchAppToken() {
    if (_twitchTokenCache && _twitchTokenCache.expiresAt > Date.now() + 300_000) {
        return _twitchTokenCache.token;
    }

    const clientId     = process.env.TWITCH_CLIENT_ID;
    const clientSecret = process.env.TWITCH_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET doivent être définis dans .env');
    }

    const body = `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;

    const data = await new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'id.twitch.tv',
            path:     '/oauth2/token',
            method:   'POST',
            headers:  { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });

    if (!data.access_token) throw new Error('Token Twitch invalide : ' + JSON.stringify(data));

    _twitchTokenCache = {
        token:     data.access_token,
        expiresAt: Date.now() + (data.expires_in * 1000)
    };

    return _twitchTokenCache.token;
}

function twitchGet(path, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.twitch.tv',
            path,
            method:  'GET',
            headers: {
                'Client-ID':     process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${token}`
            }
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

router.get('/twitch_token', async (req, res) => {
    try {
        const token = await getTwitchAppToken();
        return res.json({ access_token: token });
    } catch (err) {
        console.error('[twitch_token]', err.message);
        return res.status(500).json({ error: 'Impossible d\'obtenir le token Twitch' });
    }
});

router.get('/twitch_streams', async (req, res) => {
    try {
        const logins = [].concat(req.query.user_login || []).filter(Boolean);
        if (!logins.length) return res.json({ data: [] });

        const token  = await getTwitchAppToken();
        const params = logins.map(l => `user_login=${encodeURIComponent(l)}`).join('&');
        const data   = await twitchGet(`/helix/streams?${params}&first=20`, token);

        return res.json(data);
    } catch (err) {
        console.error('[twitch_streams]', err.message);
        return res.status(500).json({ error: 'Erreur proxy Twitch streams' });
    }
});

router.get('/twitch_search', async (req, res) => {
    try {
        const query = req.query.query;
        if (!query) return res.json({ data: [] });

        const token = await getTwitchAppToken();

        const data = await twitchGet(
            `/helix/search/channels?query=${encodeURIComponent(query)}&first=20&live_only=true`,
            token
        );

        const filtered = (data.data || []).filter(s =>
            s.is_live &&
            s.title &&
            s.title.toLowerCase().includes(query.toLowerCase())
        );

        if (filtered.length > 0) {
            const loginParams = filtered.map(s => `user_login=${encodeURIComponent(s.broadcaster_login)}`).join('&');
            const streamsData = await twitchGet(`/helix/streams?${loginParams}&first=20`, token);

            const thumbMap = new Map((streamsData.data || []).map(s => [s.user_login.toLowerCase(), s.thumbnail_url]));
            filtered.forEach(s => {
                const thumb = thumbMap.get(s.broadcaster_login.toLowerCase());
                if (thumb) s.thumbnail_url = thumb;
                s.user_login = s.broadcaster_login;
                s.user_name  = s.display_name;
            });
        }

        return res.json({ data: filtered });
    } catch (err) {
        console.error('[twitch_search]', err.message);
        return res.status(500).json({ error: 'Erreur proxy Twitch search' });
    }
});

module.exports = router;
