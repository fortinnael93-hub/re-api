const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = path.join(__dirname, '../../data/launcher.db');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Tables ────────────────────────────────────────────────
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT    NOT NULL UNIQUE,
        email      TEXT    NOT NULL UNIQUE,
        password   TEXT    NOT NULL,
        role       TEXT    NOT NULL DEFAULT 'user',
        banned     INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS tokens (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        token      TEXT    NOT NULL UNIQUE,
        cuid       TEXT,
        mac        TEXT,
        hddid      TEXT,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS launcher_versions (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        type       TEXT    NOT NULL DEFAULT 'stable',
        sftp_path  TEXT    NOT NULL DEFAULT '/versions/stable',
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skins (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        skin_id    TEXT    NOT NULL UNIQUE,
        skin_name  TEXT    NOT NULL,
        skin_file  TEXT,
        selected   INTEGER NOT NULL DEFAULT 0,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS launcher_news (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        description TEXT,
        thumbnail   TEXT,
        url         TEXT,
        tags        TEXT    DEFAULT '',
        type        TEXT    DEFAULT 'article',
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS launcher_alerts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        message    TEXT    NOT NULL,
        type       TEXT    NOT NULL DEFAULT 'infos',
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );
`);

// ── Seed : données par défaut ─────────────────────────────
const versionCount = db.prepare('SELECT COUNT(*) as c FROM launcher_versions').get();
if (versionCount.c === 0) {
    db.prepare("INSERT INTO launcher_versions (name, type, sftp_path) VALUES (?, ?, ?)").run('stable', 'stable', '/versions/stable');
    db.prepare("INSERT INTO launcher_versions (name, type, sftp_path) VALUES (?, ?, ?)").run('beta',   'beta',   '/versions/beta');
    console.log('✅ Versions par défaut créées (stable, beta)');
}

const newsCount = db.prepare('SELECT COUNT(*) as c FROM launcher_news').get();
if (newsCount.c === 0) {
    db.prepare("INSERT INTO launcher_news (title, description, thumbnail, url, tags, type) VALUES (?, ?, ?, ?, ?, ?)")
      .run('Bienvenue sur le launcher !', 'Le launcher custom est maintenant opérationnel.', '', '', 'news,update', 'article');
    console.log('✅ News par défaut créée');
}

module.exports = db;
