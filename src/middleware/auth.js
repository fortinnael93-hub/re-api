const { db } = require('../db');

async function requireAuth(req, res, next) {
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

    const tokenRow = await db.get(`
        SELECT t.*, u.id as user_id, u.username, u.role, u.banned
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = $1
    `, [token]);

    if (!tokenRow) {
        return res.status(401).json({ error: 'invalidtoken', description: 'Token invalide' });
    }
    if (tokenRow.banned) {
        return res.status(401).json({ error: 'banned', description: 'Compte banni' });
    }
    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        await db.run('DELETE FROM tokens WHERE token = $1', [token]);
        return res.status(401).json({ error: 'tokenexpired', description: 'Session expirée' });
    }

    req.user = tokenRow;
    next();
}

module.exports = { requireAuth };
