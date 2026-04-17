const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db }   = require('../db');

function parseBody(req) {
    try {
        const raw = req.body?.toString?.() || Object.keys(req.body)[0] || '';
        return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch {
        return req.body;
    }
}

// POST /v2/auth
router.post('/auth', async (req, res) => {
    try {
        const { email, password, cuid, mac, hddid } = parseBody(req);
        if (!email || !password)
            return res.json({ error: 'Veuillez renseigner une adresse email et un mot de passe' });

        const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
        if (!user) return res.json({ error: 'Adresse email ou mot de passe incorrect' });
        if (user.banned) return res.json({ error: 'Votre compte a été banni' });

        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) return res.json({ error: 'Adresse email ou mot de passe incorrect' });

        const token = uuidv4();
        await db.run('DELETE FROM tokens WHERE user_id = $1 AND cuid = $2', [user.id, cuid || null]);
        await db.run(
            `INSERT INTO tokens (user_id, token, cuid, mac, hddid, expires_at)
             VALUES ($1, $2, $3, $4, $5, (NOW() + INTERVAL '30 days')::text)`,
            [user.id, token, cuid || null, mac || null, hddid || null]
        );
        await db.run(`UPDATE users SET last_login = NOW()::text WHERE id = $1`, [user.id]);

      return res.json({ error: 'reauth.success', token: accessToken, username: tokenRow.username, role: tokenRow.role });
    } catch (err) {
        console.error('[auth]', err);
        return res.json({ error: 'Erreur serveur' });
    }
});

// POST /v2/reauth
router.post('/reauth', async (req, res) => {
    try {
        const { accessToken } = parseBody(req);
        if (!accessToken) return res.json({ error: 'Token manquant', type: 'error' });

        const tokenRow = await db.get(`
            SELECT t.*, u.username, u.role, u.banned
            FROM tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token = $1
        `, [accessToken]);

        if (!tokenRow) return res.json({ error: 'Token invalide', type: 'error' });
        if (tokenRow.banned) return res.json({ error: 'Compte banni', type: 'error' });
        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
            await db.run('DELETE FROM tokens WHERE token = $1', [accessToken]);
            return res.json({ error: 'Session expirée', type: 'error' });
        }

return res.json({
    error: null,
    type: 'reauth.success',
    token: accessToken,
    username: tokenRow.username,
    role: tokenRow.role
});
    } catch (err) {
        console.error('[reauth]', err);
        return res.json({ error: 'Erreur serveur', type: 'error' });
    }
});

// POST /v2/register
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = parseBody(req);
        if (!username || !email || !password)
            return res.json({ error: 'Tous les champs sont requis' });
        if (password.length < 6)
            return res.json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

        const existing = await db.get(
            'SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]
        );
        if (existing) return res.json({ error: 'Cet email ou ce pseudo est déjà utilisé' });

        const hashed = bcrypt.hashSync(password, 10);
        await db.run(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
            [username, email, hashed]
        );
        return res.json({ error: null, type: 'register.success' });
    } catch (err) {
        console.error('[register]', err);
        return res.json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
