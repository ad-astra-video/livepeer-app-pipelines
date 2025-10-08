const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'db');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sqlite.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    api_key TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS pool_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT NOT NULL UNIQUE,
    score INTEGER NOT NULL DEFAULT 0,
	is_active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users (id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    arbitrum_rpc_url TEXT DEFAULT '',
    graph_api_key TEXT DEFAULT ''
  );
`);

const poolColumns = db.prepare('PRAGMA table_info(pool_entries)').all();
const hasIsActiveColumn = poolColumns.some((col) => col.name === 'is_active');
if (!hasIsActiveColumn) {
  db.exec('ALTER TABLE pool_entries ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
}

const apiKeyColumns = db.prepare('PRAGMA table_info(api_keys)').all();
const hasApiKeyIsActiveColumn = apiKeyColumns.some((col) => col.name === 'is_active');
if (!hasApiKeyIsActiveColumn) {
  db.exec('ALTER TABLE api_keys ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
}

db.prepare("UPDATE users SET role = 'read-only' WHERE role NOT IN ('admin', 'read-only', 'read-write')").run();

const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
if (!settingsRow) {
  db.prepare("INSERT INTO settings (id, arbitrum_rpc_url, graph_api_key) VALUES (1, '', '')").run();
}

function parseAdminCredentials(adminFile) {
  const defaultSpec = 'admin:admin123';
  const content = fs.readFileSync(adminFile, 'utf-8').trim();
  if (!content) {
    return { username: 'admin', password: 'admin123' };
  }
  const [username, password] = content.split(':');
  if (!username || !password) {
    return { username: 'admin', password: content.trim() };
  }
  return { username: username.trim(), password: password.trim() };
}

function ensureAdminUser(adminFile, hashFn) {
  if (!fs.existsSync(adminFile)) {
    fs.writeFileSync(adminFile, 'admin:admin123\n', { encoding: 'utf-8' });
  }
  const credentials = parseAdminCredentials(adminFile);
  const passwordHash = hashFn(credentials.password);

  const userByUsername = db.prepare('SELECT * FROM users WHERE username = ?').get(credentials.username);

  if (!userByUsername) {
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
      .run(credentials.username, passwordHash, 'admin');
  } else {
    db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE id = ?')
      .run(passwordHash, 'admin', userByUsername.id);
  }
}

function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createUser(username, passwordHash, role = 'read-only') {
  return db
    .prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(username, passwordHash, role);
}

function listUsers() {
  return db
    .prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC')
    .all();
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateUserRole(id, role) {
  return db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
}

function countAdmins() {
  return db.prepare('SELECT COUNT(*) as total FROM users WHERE role = ?').get('admin').total;
}

function listPoolEntries({ includeInactive = true } = {}) {
  const baseQuery = 'SELECT id, address, score, is_active FROM pool_entries';
  const order = ' ORDER BY id ASC';
  if (includeInactive) {
    return db.prepare(baseQuery + order).all();
  }
  return db.prepare(`${baseQuery} WHERE is_active = 1${order}`).all();
}

function addPoolEntry(address, userId) {
  return db
    .prepare('INSERT OR IGNORE INTO pool_entries (address, created_by) VALUES (?, ?)')
    .run(address, userId);
}

function setPoolEntryActive(id, isActive) {
  return db
    .prepare('UPDATE pool_entries SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, id);
}

function deletePoolEntry(id) {
  return db.prepare('DELETE FROM pool_entries WHERE id = ?').run(id);
}

function getPoolEntryByAddress(address) {
  return db.prepare('SELECT * FROM pool_entries WHERE address = ?').get(address);
}

function listApiKeys() {
  return db.prepare('SELECT id, label, api_key, is_active, created_at FROM api_keys ORDER BY id DESC').all();
}

function addApiKey(label, apiKey, userId) {
  return db.prepare('INSERT INTO api_keys (label, api_key, created_by) VALUES (?, ?, ?)').run(label, apiKey, userId);
}

function isValidApiKey(apiKey) {
  return Boolean(db.prepare('SELECT id FROM api_keys WHERE api_key = ? AND is_active = 1').get(apiKey));
}

function setApiKeyActive(keyId, isActive) {
  return db.prepare('UPDATE api_keys SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, keyId);
}

function deleteApiKey(keyId) {
  return db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
}

function getApiKeyById(keyId) {
  return db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
}

function getSettings() {
  return (
    db
      .prepare('SELECT arbitrum_rpc_url, graph_api_key FROM settings WHERE id = 1')
      .get() || { arbitrum_rpc_url: '', graph_api_key: '' }
  );
}

function updateSettings({ arbitrumRpcUrl, graphApiKey }) {
  return db
    .prepare('UPDATE settings SET arbitrum_rpc_url = ?, graph_api_key = ? WHERE id = 1')
    .run(arbitrumRpcUrl, graphApiKey);
}

module.exports = {
  db,
  dataDir,
  ensureAdminUser,
  findUserByUsername,
  createUser,
  listUsers,
  getUserById,
  updateUserRole,
  countAdmins,
  listPoolEntries,
  addPoolEntry,
  setPoolEntryActive,
  deletePoolEntry,
  getPoolEntryByAddress,
  listApiKeys,
  addApiKey,
  isValidApiKey,
  setApiKeyActive,
  deleteApiKey,
  getApiKeyById,
  getSettings,
  updateSettings
};
