const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// ── POST /v2/auth  (Login) ────────────────────────────────
// Body (base64 encodé comme l'original) : { email, password, cuid, mac, hddid }
router.post('/auth', (req, res) => {
    try {
        // Le launcher envoie le body en base64
        let body;
        try {
            const raw = req.body?.toString?.() || Object.keys(req.body)[0] || '';
            body = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        } catch {
            // Fallback : body JSON direct
            body = req.body;
        }

        const { email, password, cuid, mac, hddid } = body;

        if (!email || !password) {
            return res.json({ error: 'Veuillez renseigner une adresse email et un mot de passe' });
        }

        // Chercher l'utilisateur
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

        if (!user) {
            return res.json({ error: 'Adresse email ou mot de passe incorrect' });
        }

        if (user.banned) {
            return res.json({ error: 'Votre compte a été banni' });
        }

        // Vérifier le mot de passe
        const valid = bcrypt.compareSync(password, user.password);
        if (!valid) {
            return res.json({ error: 'Adresse email ou mot de passe incorrect' });
        }

        // Générer un token
        const token = uuidv4();

        // Supprimer les anciens tokens du device
        db.prepare('DELETE FROM tokens WHERE user_id = ? AND cuid = ?').run(user.id, cuid || null);

        // Sauvegarder le nouveau token
        db.prepare(`
            INSERT INTO tokens (user_id, token, cuid, mac, hddid, expires_at)
            VALUES (?, ?, ?, ?, ?, datetime('now', '+30 days'))
        `).run(user.id, token, cuid || null, mac || null, hddid || null);

        // Mettre à jour last_login
        db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);

        return res.json({
            error: null,
            type: 'auth.success',
            token: token,
            username: user.username,
            role: user.role
        });

    } catch (err) {
        console.error('[auth] Erreur:', err);
        return res.json({ error: 'Erreur serveur' });
    }
});

// ── POST /v2/reauth  (Re-authentification au démarrage) ──
// Body (base64) : { accessToken, cuid, mac, hddid }
router.post('/reauth', (req, res) => {
    try {
        let body;
        try {
            const raw = req.body?.toString?.() || Object.keys(req.body)[0] || '';
            body = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        } catch {
            body = req.body;
        }

        const { accessToken, cuid } = body;

        if (!accessToken) {
            return res.json({ error: 'Token manquant', type: 'error' });
        }

        // Vérifier le token
        const tokenRow = db.prepare(`
            SELECT t.*, u.username, u.role, u.banned
            FROM tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token = ?
        `).get(accessToken);

        if (!tokenRow) {
            return res.json({ error: 'Token invalide', type: 'error' });
        }

        if (tokenRow.banned) {
            return res.json({ error: 'Votre compte a été banni', type: 'error' });
        }

        // Vérifier expiration
        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
            db.prepare('DELETE FROM tokens WHERE token = ?').run(accessToken);
            return res.json({ error: 'Session expirée', type: 'error' });
        }

        // Récupérer la config SFTP depuis l'env
        const sftpHost = process.env.SFTP_HOST;
        const sftpPrivateKey = process.env.SFTP_PRIVATE_KEY;

        if (!sftpHost || !sftpPrivateKey) {
            console.error('[reauth] SFTP_HOST ou SFTP_PRIVATE_KEY manquant dans .env');
            return res.json({ error: 'Configuration SFTP manquante côté serveur', type: 'error' });
        }

        // Encoder en base64 comme attendu par le launcher
        const hostB64 = Buffer.from(sftpHost).toString('base64');
        const keyB64 = Buffer.from(sftpPrivateKey).toString('base64');

        return res.json({
            error: 'reauth.success',
            token: accessToken,
            username: tokenRow.username,
            role: tokenRow.role,
            host: hostB64,
            privateKey: keyB64
        });

    } catch (err) {
        console.error('[reauth] Erreur:', err);
        return res.json({ error: 'Erreur serveur', type: 'error' });
    }
});

// ── POST /v2/register  (Inscription) ─────────────────────
router.post('/register', (req, res) => {
    try {
        let body;
        try {
            const raw = req.body?.toString?.() || Object.keys(req.body)[0] || '';
            body = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
        } catch {
            body = req.body;
        }

        const { username, email, password } = body;

        if (!username || !email || !password) {
            return res.json({ error: 'Tous les champs sont requis' });
        }

        if (password.length < 6) {
            return res.json({ error: 'Le mot de passe doit faire au moins 6 caractères' });
        }

        // Vérifier si email ou username existe déjà
        const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
        if (existing) {
            return res.json({ error: 'Cet email ou ce pseudo est déjà utilisé' });
        }

        // Hasher le mot de passe
        const hashed = bcrypt.hashSync(password, 10);

        // Créer l'utilisateur
        db.prepare(`
            INSERT INTO users (username, email, password)
            VALUES (?, ?, ?)
        `).run(username, email, hashed);

        return res.json({ error: null, type: 'register.success' });

    } catch (err) {
        console.error('[register] Erreur:', err);
        return res.json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
