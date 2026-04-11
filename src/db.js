const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Helper : remplace better-sqlite3 .get() / .all() / .run() par des appels async
// On expose un objet `db` avec les mêmes méthodes mais en async/await

const db = {
    // Exécute une requête et retourne la première ligne
    async get(sql, params = []) {
        const { rows } = await pool.query(sql, params);
        return rows[0] || null;
    },
    // Exécute une requête et retourne toutes les lignes
    async all(sql, params = []) {
        const { rows } = await pool.query(sql, params);
        return rows;
    },
    // Exécute une requête sans retour de données (INSERT/UPDATE/DELETE)
    async run(sql, params = []) {
        const result = await pool.query(sql, params);
        return { lastInsertRowid: result.rows[0]?.id || null, changes: result.rowCount };
    },
    // Accès direct au pool pour les transactions
    pool
};

// ── Création des tables (à l'init) ───────────────────────
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

        CREATE TABLE IF NOT EXISTS launcher_versions (
            id         SERIAL PRIMARY KEY,
            name       TEXT    NOT NULL UNIQUE,
            type       TEXT    NOT NULL DEFAULT 'stable',
            sftp_path  TEXT    NOT NULL DEFAULT '/versions/stable',
            active     INTEGER NOT NULL DEFAULT 1,
            created_at TEXT    NOT NULL DEFAULT (NOW()::text)
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

    // Seed versions
    const versionCount = await db.get('SELECT COUNT(*) as c FROM launcher_versions');
    if (parseInt(versionCount.c) === 0) {
        await db.run("INSERT INTO launcher_versions (name, type, sftp_path) VALUES ($1, $2, $3)", ['stable', 'stable', '/versions/stable']);
        await db.run("INSERT INTO launcher_versions (name, type, sftp_path) VALUES ($1, $2, $3)", ['beta', 'beta', '/versions/beta']);
        console.log('✅ Versions par défaut créées');
    }

    // Seed news
    const newsCount = await db.get('SELECT COUNT(*) as c FROM launcher_news');
    if (parseInt(newsCount.c) === 0) {
        await db.run(
            "INSERT INTO launcher_news (title, description, thumbnail, url, tags, type) VALUES ($1, $2, $3, $4, $5, $6)",
            ['Bienvenue sur le launcher !', 'Le launcher custom est opérationnel.', '', '', 'news,update', 'article']
        );
        console.log('✅ News par défaut créée');
    }

    console.log('✅ Base de données initialisée');
}

module.exports = { db, initDB };
