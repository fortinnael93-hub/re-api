const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');

// ── Middleware admin ──────────────────────────────────────
function requireAdmin(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!apiKey || apiKey !== process.env.ADMIN_KEY) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    next();
}

// ── GET /admin/users  ─────────────────────────────────────
router.get('/users', requireAdmin, (req, res) => {
    const users = db.prepare(`
        SELECT id, username, email, role, banned, created_at, last_login FROM users
        ORDER BY created_at DESC
    `).all();
    return res.json(users);
});

// ── POST /admin/users  (créer un utilisateur) ─────────────
router.post('/users', requireAdmin, (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'username, email et password requis' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) return res.status(400).json({ error: 'Email ou pseudo déjà utilisé' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
        INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)
    `).run(username, email, hashed, role || 'user');

    return res.json({ id: result.lastInsertRowid, username, email, role: role || 'user' });
});

// ── PATCH /admin/users/:id/ban  ───────────────────────────
router.patch('/users/:id/ban', requireAdmin, (req, res) => {
    const { banned } = req.body; // true / false
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(banned ? 1 : 0, req.params.id);
    return res.json({ ok: true });
});

// ── DELETE /admin/users/:id  ──────────────────────────────
router.delete('/users/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    return res.json({ ok: true });
});

// ── GET /admin/versions  ──────────────────────────────────
router.get('/versions', requireAdmin, (req, res) => {
    return res.json(db.prepare('SELECT * FROM launcher_versions').all());
});

// ── POST /admin/versions  ─────────────────────────────────
router.post('/versions', requireAdmin, (req, res) => {
    const { name, type, sftp_path } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    const path = sftp_path || `/versions/${name}`;
    const result = db.prepare(`INSERT INTO launcher_versions (name, type, sftp_path) VALUES (?, ?, ?)`).run(name, type || 'stable', path);
    return res.json({ id: result.lastInsertRowid, name, type: type || 'stable', sftp_path: path });
});

// ── PATCH /admin/versions/:id  ────────────────────────────
router.patch('/versions/:id', requireAdmin, (req, res) => {
    const { name, type, sftp_path, active } = req.body;
    const fields = [];
    const vals = [];
    if (name !== undefined)      { fields.push('name = ?');      vals.push(name); }
    if (type !== undefined)      { fields.push('type = ?');      vals.push(type); }
    if (sftp_path !== undefined) { fields.push('sftp_path = ?'); vals.push(sftp_path); }
    if (active !== undefined)    { fields.push('active = ?');    vals.push(active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ à modifier' });
    vals.push(req.params.id);
    db.prepare(`UPDATE launcher_versions SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
    return res.json({ ok: true });
});

// ── DELETE /admin/versions/:id  ───────────────────────────
router.delete('/versions/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM launcher_versions WHERE id = ?').run(req.params.id);
    return res.json({ ok: true });
});

// ── GET /admin/sftp  ─────────────────────────────────────
// Vérifie la config SFTP actuelle (sans exposer la clé privée)
router.get('/sftp', requireAdmin, (req, res) => {
    const host = process.env.SFTP_HOST;
    const key  = process.env.SFTP_PRIVATE_KEY;
    return res.json({
        configured: !!(host && key),
        host: host || null,
        privateKeySet: !!key,
        note: 'Modifiez SFTP_HOST et SFTP_PRIVATE_KEY dans votre .env puis redémarrez.'
    });
});

// ── GET /admin/news  ──────────────────────────────────────
router.get('/news', requireAdmin, (req, res) => {
    return res.json(db.prepare('SELECT * FROM launcher_news ORDER BY created_at DESC').all());
});

// ── POST /admin/news  ─────────────────────────────────────
router.post('/news', requireAdmin, (req, res) => {
    const { title, description, thumbnail, url, tags, type } = req.body;
    if (!title) return res.status(400).json({ error: 'title requis' });
    const result = db.prepare(`
        INSERT INTO launcher_news (title, description, thumbnail, url, tags, type)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, description || '', thumbnail || '', url || '', tags || '', type || 'article');
    return res.json({ id: result.lastInsertRowid });
});

// ── DELETE /admin/news/:id  ───────────────────────────────
router.delete('/news/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM launcher_news WHERE id = ?').run(req.params.id);
    return res.json({ ok: true });
});

module.exports = router;
