const db = require('../db');

/**
 * Middleware d'authentification universel.
 * Accepte le token via :
 *  - query: ?token=, ?authtoken=, ?accessToken=
 *  - header: x-auth-token, authorization (Bearer)
 *  - body:   accessToken, token
 */
function requireAuth(req, res, next) {
    const token =
        req.query.token ||
        req.query.authtoken ||
        req.query.accessToken ||
        req.headers['x-auth-token'] ||
        (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '') ||
        req.body?.accessToken ||
        req.body?.token ||
        null;

    if (!token) {
        return res.status(401).json({ error: 'invalidtoken', description: 'Token requis' });
    }

    const tokenRow = db.prepare(`
        SELECT t.*, u.id as user_id, u.username, u.role, u.banned
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
    `).get(token);

    if (!tokenRow) {
        return res.status(401).json({ error: 'invalidtoken', description: 'Token invalide ou expiré' });
    }

    if (tokenRow.banned) {
        return res.status(401).json({ error: 'banned', description: 'Votre compte a été banni' });
    }

    // Vérifier expiration
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
        return res.status(401).json({ error: 'tokenexpired', description: 'Session expirée, reconnectez-vous' });
    }

    req.user = tokenRow;
    next();
}

module.exports = { requireAuth };
