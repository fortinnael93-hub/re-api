const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcryptjs');
const { db }   = require('../db');

function requireAdmin(req, res, next) {
    const apiKey = req.headers['x-admin-key'];
    if (!apiKey || apiKey !== process.env.ADMIN_KEY)
        return res.status(403).json({ error: 'Accès refusé' });
    next();
}

// ── Users ─────────────────────────────────────────────────
router.get('/users', requireAdmin, async (req, res) => {
    const users = await db.all(
        'SELECT id, username, email, role, banned, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    return res.json(users);
});

router.post('/users', requireAdmin, async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password)
        return res.status(400).json({ error: 'username, email et password requis' });
    const existing = await db.get('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing) return res.status(400).json({ error: 'Email ou pseudo déjà utilisé' });
    const hashed = bcrypt.hashSync(password, 10);
    const result = await db.run(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, hashed, role || 'user']
    );
    return res.json({ id: result.lastInsertRowid, username, email, role: role || 'user' });
});

router.patch('/users/:id/ban', requireAdmin, async (req, res) => {
    const { banned } = req.body;
    await db.run('UPDATE users SET banned = $1 WHERE id = $2', [banned ? 1 : 0, req.params.id]);
    return res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM users WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
});

// ── Versions ──────────────────────────────────────────────
router.get('/versions', requireAdmin, async (req, res) => {
    return res.json(await db.all('SELECT * FROM launcher_versions'));
});

router.post('/versions', requireAdmin, async (req, res) => {
    const { name, type, sftp_path } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    const p = sftp_path || `/versions/${name}`;
    const result = await db.run(
        'INSERT INTO launcher_versions (name, type, sftp_path) VALUES ($1, $2, $3) RETURNING id',
        [name, type || 'stable', p]
    );
    return res.json({ id: result.lastInsertRowid, name, type: type || 'stable', sftp_path: p });
});

router.patch('/versions/:id', requireAdmin, async (req, res) => {
    const { name, type, sftp_path, active } = req.body;
    const fields = [], vals = [];
    let i = 1;
    if (name      !== undefined) { fields.push(`name = $${i++}`);      vals.push(name); }
    if (type      !== undefined) { fields.push(`type = $${i++}`);      vals.push(type); }
    if (sftp_path !== undefined) { fields.push(`sftp_path = $${i++}`); vals.push(sftp_path); }
    if (active    !== undefined) { fields.push(`active = $${i++}`);    vals.push(active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    await db.run(`UPDATE launcher_versions SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    return res.json({ ok: true });
});

router.delete('/versions/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM launcher_versions WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
});

// ── News ──────────────────────────────────────────────────
router.get('/news', requireAdmin, async (req, res) => {
    return res.json(await db.all('SELECT * FROM launcher_news ORDER BY created_at DESC'));
});

router.post('/news', requireAdmin, async (req, res) => {
    const { title, description, thumbnail, url, tags, type } = req.body;
    if (!title) return res.status(400).json({ error: 'title requis' });
    const result = await db.run(
        'INSERT INTO launcher_news (title, description, thumbnail, url, tags, type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [title, description || '', thumbnail || '', url || '', tags || '', type || 'article']
    );
    return res.json({ id: result.lastInsertRowid });
});

router.patch('/news/:id', requireAdmin, async (req, res) => {
    const { title, description, thumbnail, url, tags, type, active } = req.body;
    const fields = [], vals = [];
    let i = 1;
    if (title       !== undefined) { fields.push(`title = $${i++}`);       vals.push(title); }
    if (description !== undefined) { fields.push(`description = $${i++}`); vals.push(description); }
    if (thumbnail   !== undefined) { fields.push(`thumbnail = $${i++}`);   vals.push(thumbnail); }
    if (url         !== undefined) { fields.push(`url = $${i++}`);         vals.push(url); }
    if (tags        !== undefined) { fields.push(`tags = $${i++}`);        vals.push(tags); }
    if (type        !== undefined) { fields.push(`type = $${i++}`);        vals.push(type); }
    if (active      !== undefined) { fields.push(`active = $${i++}`);      vals.push(active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    await db.run(`UPDATE launcher_news SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    return res.json({ ok: true });
});

router.delete('/news/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM launcher_news WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
});

// ── Alerts ────────────────────────────────────────────────
router.get('/alerts', requireAdmin, async (req, res) => {
    return res.json(await db.all('SELECT * FROM launcher_alerts ORDER BY created_at DESC'));
});

router.post('/alerts', requireAdmin, async (req, res) => {
    const { message, type } = req.body;
    if (!message) return res.status(400).json({ error: 'message requis' });
    const result = await db.run(
        'INSERT INTO launcher_alerts (message, type) VALUES ($1, $2) RETURNING id',
        [message, type || 'infos']
    );
    return res.json({ id: result.lastInsertRowid });
});

router.patch('/alerts/:id', requireAdmin, async (req, res) => {
    const { message, type, active } = req.body;
    const fields = [], vals = [];
    let i = 1;
    if (message !== undefined) { fields.push(`message = $${i++}`); vals.push(message); }
    if (type    !== undefined) { fields.push(`type = $${i++}`);    vals.push(type); }
    if (active  !== undefined) { fields.push(`active = $${i++}`);  vals.push(active ? 1 : 0); }
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ' });
    vals.push(req.params.id);
    await db.run(`UPDATE launcher_alerts SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    return res.json({ ok: true });
});

router.delete('/alerts/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM launcher_alerts WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
});

// ── SFTP status ───────────────────────────────────────────
router.get('/sftp', requireAdmin, (req, res) => {
    return res.json({
        configured: !!(process.env.SFTP_HOST && process.env.SFTP_PRIVATE_KEY),
        host: process.env.SFTP_HOST || null,
        privateKeySet: !!process.env.SFTP_PRIVATE_KEY
    });
});

module.exports = router;
