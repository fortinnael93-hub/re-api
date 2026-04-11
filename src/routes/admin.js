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
    return res.json(await db.all(
        'SELECT id, username, email, role, banned, created_at, last_login FROM users ORDER BY created_at DESC'
    ));
});

router.post('/users', requireAdmin, async (req, res) => {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password)
        return res.status(400).json({ error: 'username, email et password requis' });
    const existing = await db.get('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing) return res.status(400).json({ error: 'Email ou pseudo déjà utilisé' });
    const hashed = bcrypt.hashSync(password, 10);
    const result = await db.run(
        'INSERT INTO users (username, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id',
        [username, email, hashed, role || 'user']
    );
    return res.json({ id: result.lastInsertRowid, username, email, role: role || 'user' });
});

router.patch('/users/:id/ban', requireAdmin, async (req, res) => {
    await db.run('UPDATE users SET banned = $1 WHERE id = $2', [req.body.banned ? 1 : 0, req.params.id]);
    return res.json({ ok: true });
});

router.patch('/users/:id/role', requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role requis' });
    await db.run('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
    return res.json({ ok: true });
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM users WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
});

// ── Modpacks ──────────────────────────────────────────────
router.get('/modpacks', requireAdmin, async (req, res) => {
    const modpacks = await db.all('SELECT * FROM modpacks ORDER BY id ASC');
    for (const mp of modpacks) {
        mp.roles = (await db.all('SELECT role FROM modpack_roles WHERE modpack_id = $1', [mp.id])).map(r => r.role);
        mp.users = (await db.all(
            'SELECT u.id, u.username FROM modpack_users mu JOIN users u ON u.id = mu.user_id WHERE mu.modpack_id = $1',
            [mp.id]
        ));
    }
    return res.json(modpacks);
});

router.post('/modpacks', requireAdmin, async (req, res) => {
    const { name, display_name, description, background_url, sftp_path, roles, users } = req.body;
    if (!name || !display_name) return res.status(400).json({ error: 'name et display_name requis' });

    const result = await db.run(
        'INSERT INTO modpacks (name, display_name, description, background_url, sftp_path) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [name, display_name, description || '', background_url || '', sftp_path || `/versions/${name}`]
    );
    const modpackId = result.lastInsertRowid;

    // Ajouter les rôles
    for (const role of (roles || [])) {
        await db.run('INSERT INTO modpack_roles (modpack_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [modpackId, role]);
    }
    // Ajouter les users
    for (const userId of (users || [])) {
        await db.run('INSERT INTO modpack_users (modpack_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [modpackId, userId]);
    }

    return res.json({ id: modpackId, name, display_name });
});

router.patch('/modpacks/:id', requireAdmin, async (req, res) => {
    const { name, display_name, description, background_url, sftp_path, active } = req.body;
    const fields = [], vals = [];
    let i = 1;
    if (name           !== undefined) { fields.push(`name = $${i++}`);           vals.push(name); }
    if (display_name   !== undefined) { fields.push(`display_name = $${i++}`);   vals.push(display_name); }
    if (description    !== undefined) { fields.push(`description = $${i++}`);    vals.push(description); }
    if (background_url !== undefined) { fields.push(`background_url = $${i++}`); vals.push(background_url); }
    if (sftp_path      !== undefined) { fields.push(`sftp_path = $${i++}`);      vals.push(sftp_path); }
    if (active         !== undefined) { fields.push(`active = $${i++}`);         vals.push(active ? 1 : 0); }
    if (fields.length) {
        vals.push(req.params.id);
        await db.run(`UPDATE modpacks SET ${fields.join(', ')} WHERE id = $${i}`, vals);
    }
    return res.json({ ok: true });
});

router.delete('/modpacks/:id', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM modpacks WHERE id = $1', [req.params.id]);
    return res.json({ ok: true });
});

// ── Modpack roles ─────────────────────────────────────────
router.post('/modpacks/:id/roles', requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!role) return res.status(400).json({ error: 'role requis' });
    await db.run('INSERT INTO modpack_roles (modpack_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, role]);
    return res.json({ ok: true });
});

router.delete('/modpacks/:id/roles/:role', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM modpack_roles WHERE modpack_id = $1 AND role = $2', [req.params.id, req.params.role]);
    return res.json({ ok: true });
});

// ── Modpack users ─────────────────────────────────────────
router.post('/modpacks/:id/users', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requis' });
    await db.run('INSERT INTO modpack_users (modpack_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, user_id]);
    return res.json({ ok: true });
});

router.delete('/modpacks/:id/users/:userId', requireAdmin, async (req, res) => {
    await db.run('DELETE FROM modpack_users WHERE modpack_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
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
        'INSERT INTO launcher_alerts (message, type) VALUES ($1,$2) RETURNING id',
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
