const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'bearcaptcha.db');

let db = null;

function getDb() {
  if (db) return db;

  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id          TEXT PRIMARY KEY,
      key         TEXT UNIQUE NOT NULL,
      label       TEXT NOT NULL DEFAULT 'Unnamed Key',
      created_at  TEXT NOT NULL,
      last_used   TEXT,
      requests    INTEGER NOT NULL DEFAULT 0,
      credits     INTEGER NOT NULL DEFAULT 0,
      active      INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_keys_key ON keys(key);
    CREATE INDEX IF NOT EXISTS idx_keys_active ON keys(active);
  `);

  return db;
}

function rowToEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    createdAt: row.created_at,
    lastUsed: row.last_used,
    requests: row.requests,
    credits: row.credits,
    active: Boolean(row.active)
  };
}

function getAllKeys() {
  return getDb().prepare('SELECT * FROM keys ORDER BY created_at DESC').all().map(rowToEntry);
}

function getKey(apiKey) {
  return rowToEntry(getDb().prepare('SELECT * FROM keys WHERE key = ?').get(apiKey));
}

function createKey(label, credits) {
  const id = uuidv4();
  const key = 'brk_' + uuidv4().replace(/-/g, '');
  const now = new Date().toISOString();

  getDb().prepare(`
    INSERT INTO keys (id, key, label, created_at, last_used, requests, credits, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, key, label || 'Unnamed Key', now, null, 0, typeof credits === 'number' ? credits : 0, 1);

  return getKey(key);
}

function revokeKey(id) {
  const result = getDb().prepare('UPDATE keys SET active = 0 WHERE id = ?').run(id);
  return result.changes > 0;
}

function deleteKey(id) {
  const result = getDb().prepare('DELETE FROM keys WHERE id = ?').run(id);
  return result.changes > 0;
}

function addCredits(id, amount) {
  const stmt = getDb().prepare('UPDATE keys SET credits = credits + ? WHERE id = ?');
  const result = stmt.run(amount, id);
  if (result.changes === 0) return false;

  const row = getDb().prepare('SELECT credits FROM keys WHERE id = ?').get(id);
  return row ? row.credits : false;
}

function deductCredit(apiKey) {
  const now = new Date().toISOString();

  const result = getDb().prepare(`
    UPDATE keys
    SET credits = credits - 1,
        requests = requests + 1,
        last_used = ?
    WHERE key = ? AND credits > 0 AND active = 1
  `).run(now, apiKey);

  return result.changes > 0;
}

function getStats() {
  const row = getDb().prepare(`
    SELECT
      COUNT(*)                    AS total_keys,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active_keys,
      COALESCE(SUM(requests), 0)  AS total_requests,
      COALESCE(SUM(credits), 0)   AS total_credits
    FROM keys
  `).get();

  return {
    totalKeys: row.total_keys,
    activeKeys: row.active_keys,
    totalRequests: row.total_requests,
    totalCredits: row.total_credits
  };
}

module.exports = { getAllKeys, getKey, createKey, revokeKey, deleteKey, addCredits, deductCredit, getStats };
