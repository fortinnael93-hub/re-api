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
    const { name, type } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    const result = db.prepare(`INSERT INTO launcher_versions (name, type) VALUES (?, ?)`).run(name, type || 'stable');
    return res.json({ id: result.lastInsertRowid, name, type: type || 'stable' });
});

// ── DELETE /admin/versions/:id  ───────────────────────────
router.delete('/versions/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM launcher_versions WHERE id = ?').run(req.params.id);
    return res.json({ ok: true });
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
