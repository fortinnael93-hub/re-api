const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    family: 4
});

const db = {
    async get(sql, params = []) {
        const { rows } = await pool.query(sql, params);
        return rows[0] || null;
    },
    async all(sql, params = []) {
        const { rows } = await pool.query(sql, params);
        return rows;
    },
    async run(sql, params = []) {
        const result = await pool.query(sql, params);
        return { lastInsertRowid: result.rows[0]?.id || null, changes: result.rowCount };
    },
    pool
};

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id         SERIAL PRIMARY KEY,
            username   TEXT    NOT NULL UNIQUE,
            email      TEXT    NOT NULL UNIQUE,
            password   TEXT    NOT NULL,
            role       TEXT    NOT NULL DEFAULT 'user',
            banned     INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL DEFAULT (NOW()::text),
            last_login TEXT
        );

        CREATE TABLE IF NOT EXISTS tokens (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token      TEXT    NOT NULL UNIQUE,
            cuid       TEXT,
            mac        TEXT,
            hddid      TEXT,
            created_at TEXT    NOT NULL DEFAULT (NOW()::text),
            expires_at TEXT
        );

        CREATE TABLE IF NOT EXISTS modpacks (
            id              SERIAL PRIMARY KEY,
            name            TEXT    NOT NULL UNIQUE,
            display_name    TEXT    NOT NULL,
            description     TEXT    DEFAULT '',
            background_url  TEXT    DEFAULT '',
            sftp_path       TEXT    NOT NULL DEFAULT '/versions/stable',
            active          INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT    NOT NULL DEFAULT (NOW()::text)
        );

        CREATE TABLE IF NOT EXISTS modpack_roles (
            id          SERIAL PRIMARY KEY,
            modpack_id  INTEGER NOT NULL REFERENCES modpacks(id) ON DELETE CASCADE,
            role        TEXT    NOT NULL,
            UNIQUE(modpack_id, role)
        );

        CREATE TABLE IF NOT EXISTS modpack_users (
            id          SERIAL PRIMARY KEY,
            modpack_id  INTEGER NOT NULL REFERENCES modpacks(id) ON DELETE CASCADE,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(modpack_id, user_id)
        );

        CREATE TABLE IF NOT EXISTS skins (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            skin_id    TEXT    NOT NULL UNIQUE,
            skin_name  TEXT    NOT NULL,
            skin_file  TEXT,
            selected   INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL DEFAULT (NOW()::text)
        );

        CREATE TABLE IF NOT EXISTS launcher_news (
            id          SERIAL PRIMARY KEY,
            title       TEXT    NOT NULL,
            description TEXT,
            thumbnail   TEXT,
            url         TEXT,
            tags        TEXT    DEFAULT '',
            type        TEXT    DEFAULT 'article',
            active      INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT    NOT NULL DEFAULT (NOW()::text)
        );

        CREATE TABLE IF NOT EXISTS launcher_alerts (
            id         SERIAL PRIMARY KEY,
            message    TEXT    NOT NULL,
            type       TEXT    NOT NULL DEFAULT 'infos',
            active     INTEGER NOT NULL DEFAULT 1,
            created_at TEXT    NOT NULL DEFAULT (NOW()::text)
        );
    `);

    // Seed modpack par défaut
    const modpackCount = await db.get('SELECT COUNT(*) as c FROM modpacks');
    if (parseInt(modpackCount.c) === 0) {
        const result = await db.run(
            "INSERT INTO modpacks (name, display_name, description, background_url, sftp_path) VALUES ($1,$2,$3,$4,$5) RETURNING id",
            ['stable', 'Stable', 'Version stable', '', '/versions/stable']
        );
        // Accessible à tous les rôles par défaut
        await db.run("INSERT INTO modpack_roles (modpack_id, role) VALUES ($1, $2)", [result.lastInsertRowid, 'user']);
        await db.run("INSERT INTO modpack_roles (modpack_id, role) VALUES ($1, $2)", [result.lastInsertRowid, 'vip']);
        await db.run("INSERT INTO modpack_roles (modpack_id, role) VALUES ($1, $2)", [result.lastInsertRowid, 'admin']);
        console.log('✅ Modpack stable créé par défaut');
    }

    // Seed news
    const newsCount = await db.get('SELECT COUNT(*) as c FROM launcher_news');
    if (parseInt(newsCount.c) === 0) {
        await db.run(
            "INSERT INTO launcher_news (title, description, thumbnail, url, tags, type) VALUES ($1,$2,$3,$4,$5,$6)",
            ['Bienvenue !', 'Le launcher est opérationnel.', '', '', 'news', 'article']
        );
        console.log('✅ News par défaut créée');
    }

    console.log('✅ Base de données initialisée');
}

module.exports = { db, initDB };
