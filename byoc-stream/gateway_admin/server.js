const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const {
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
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_FILE = path.join(__dirname, '.admin');

const syncAdminCredentials = () => {
  ensureAdminUser(ADMIN_FILE, (password) => bcrypt.hashSync(password, 10));
};

syncAdminCredentials();

fs.watchFile(ADMIN_FILE, { interval: 1000 }, (curr, prev) => {
  if (curr.mtimeMs === prev.mtimeMs && curr.size === prev.size) {
    return;
  }
  try {
    syncAdminCredentials();
    console.log('Admin credentials synced from .admin');
  } catch (err) {
    console.error('Failed to sync admin credentials:', err);
  }
});

if (!fs.existsSync(path.join(__dirname, 'views'))) {
  fs.mkdirSync(path.join(__dirname, 'views'), { recursive: true });
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(
  session({
  store: new SQLiteStore({ db: 'sessions.db', dir: dataDir }),
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60
    }
  })
);

const WRITE_ROLES = new Set(['admin', 'read-write']);

app.use((req, res, next) => {
  const user = req.session.user;
  const role = user ? user.role : null;
  const isAdmin = role === 'admin';
  const canWrite = role && WRITE_ROLES.has(role);
  res.locals.currentUser = user;
  res.locals.isAdmin = Boolean(isAdmin);
  res.locals.canWrite = Boolean(canWrite);
  res.locals.isReadOnly = Boolean(role === 'read-only' || !canWrite);
  res.locals.flash = req.session.flash;
  delete req.session.flash;
  next();
});

function generateStreamId(length = 10) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i] % alphabet.length];
  }
  return result;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/admin/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    if (!req.session.user) {
      return res.redirect('/admin/login');
    }
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(403).json({ error: 'Admin privileges required.' });
    }
    setFlash(req, 'error', 'Admin privileges required.');
    return res.redirect('/admin');
  }
  next();
}

function hasWriteAccess(user) {
  return Boolean(user && WRITE_ROLES.has(user.role));
}

function requireWriteAccess(req, res, next) {
  if (!hasWriteAccess(req.session.user)) {
    if (!req.session.user) {
      return res.redirect('/admin/login');
    }
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(403).json({ error: 'Write access required.' });
    }
    setFlash(req, 'error', 'Write access required.');
    return res.redirect('/admin/dashboard');
  }
  next();
}

function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

app.get('/admin/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/admin/dashboard');
  }
  res.render('login');
});

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    setFlash(req, 'error', 'Username and password are required.');
    return res.redirect('/admin/login');
  }
  const user = findUserByUsername(username.trim());
  if (!user) {
    setFlash(req, 'error', 'Invalid credentials.');
    return res.redirect('/admin/login');
  }
  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    setFlash(req, 'error', 'Invalid credentials.');
    return res.redirect('/admin/login');
  }
  const allowedRoles = ['admin', 'read-write', 'read-only'];
  const normalizedRole = allowedRoles.includes(user.role) ? user.role : 'read-only';
  req.session.user = { id: user.id, username: user.username, role: normalizedRole };
  setFlash(req, 'success', `Welcome back, ${user.username}!`);
  res.redirect('/admin/dashboard');
});

app.get('/admin/signup', (req, res) => {
  res.render('signup');
});

app.post('/admin/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    setFlash(req, 'error', 'Username and password are required.');
    return res.redirect('/admin/signup');
  }
  const existing = findUserByUsername(username.trim());
  if (existing) {
    setFlash(req, 'error', 'Username already taken.');
    return res.redirect('/admin/signup');
  }
  const hash = await bcrypt.hash(password, 10);
  createUser(username.trim(), hash, 'read-only');
  setFlash(req, 'success', 'Account created with read-only access. Log in now.');
  res.redirect('/admin/login');
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

app.get('/admin', requireAuth, (req, res) => {
  res.redirect('/admin/dashboard');
});

app.get('/admin/dashboard', requireAuth, (req, res) => {
  const poolEntries = listPoolEntries();
  const apiKeys = listApiKeys();
  const canWrite = hasWriteAccess(req.session.user);
  const settings = getSettings();
  res.render('dashboard', {
    poolEntries,
    apiKeys,
    canManage: canWrite,
    activePage: 'dashboard',
    currentUser: req.session.user,
    settings
  });
});

app.post('/admin/settings', requireAuth, requireWriteAccess, (req, res) => {
  const arbitrumRpcUrl = typeof req.body.arbitrumRpcUrl === 'string' ? req.body.arbitrumRpcUrl.trim() : '';
  const graphApiKey = typeof req.body.graphApiKey === 'string' ? req.body.graphApiKey.trim() : '';

  updateSettings({ arbitrumRpcUrl, graphApiKey });
  setFlash(req, 'success', 'Settings saved.');
  res.redirect('/admin/dashboard');
});

app.post('/admin/pool', requireAuth, requireWriteAccess, (req, res) => {
  const { address } = req.body;
  if (!address) {
    setFlash(req, 'error', 'Address is required.');
    return res.redirect('/admin/dashboard');
  }
  try {
    const result = addPoolEntry(address.trim(), req.session.user.id);
    if (result.changes === 0) {
      const existing = getPoolEntryByAddress(address.trim());
      if (existing && existing.is_active === 0) {
        setPoolEntryActive(existing.id, true);
        setFlash(req, 'success', 'Existing pool entry re-enabled.');
      } else {
        setFlash(req, 'error', 'Address already exists in the pool.');
      }
    } else {
      setFlash(req, 'success', 'Pool entry added.');
    }
  } catch (err) {
    setFlash(req, 'error', 'Could not add address (maybe already exists).');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/pool/:id/disable', requireAuth, requireWriteAccess, (req, res) => {
  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId)) {
    setFlash(req, 'error', 'Invalid pool entry.');
    return res.redirect('/admin/dashboard');
  }
  const result = setPoolEntryActive(entryId, false);
  if (result.changes === 0) {
    setFlash(req, 'error', 'Pool entry not found.');
  } else {
    setFlash(req, 'success', 'Pool entry disabled.');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/pool/:id/enable', requireAuth, requireWriteAccess, (req, res) => {
  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId)) {
    setFlash(req, 'error', 'Invalid pool entry.');
    return res.redirect('/admin/dashboard');
  }
  const result = setPoolEntryActive(entryId, true);
  if (result.changes === 0) {
    setFlash(req, 'error', 'Pool entry not found.');
  } else {
    setFlash(req, 'success', 'Pool entry enabled.');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/pool/:id/delete', requireAuth, requireWriteAccess, (req, res) => {
  const entryId = Number(req.params.id);
  if (!Number.isInteger(entryId)) {
    setFlash(req, 'error', 'Invalid pool entry.');
    return res.redirect('/admin/dashboard');
  }
  const result = deletePoolEntry(entryId);
  if (result.changes === 0) {
    setFlash(req, 'error', 'Pool entry not found.');
  } else {
    setFlash(req, 'success', 'Pool entry removed.');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/keys', requireAuth, requireWriteAccess, (req, res) => {
  const { label, apiKey } = req.body;
  if (!apiKey) {
    setFlash(req, 'error', 'API key value is required.');
    return res.redirect('/admin/dashboard');
  }
  try {
    const result = addApiKey(label ? label.trim() : null, apiKey.trim(), req.session.user.id);
    if (result.changes === 0) {
      setFlash(req, 'error', 'API key already exists.');
    } else {
      setFlash(req, 'success', 'API key saved.');
    }
  } catch (err) {
    setFlash(req, 'error', 'Could not save key (maybe already exists).');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/keys/:id/disable', requireAuth, requireWriteAccess, (req, res) => {
  const keyId = Number(req.params.id);
  if (!Number.isInteger(keyId)) {
    setFlash(req, 'error', 'Invalid key ID.');
    return res.redirect('/admin/dashboard');
  }
  
  try {
    const result = setApiKeyActive(keyId, false);
    if (result.changes === 0) {
      setFlash(req, 'error', 'API key not found.');
    } else {
      setFlash(req, 'success', 'API key disabled.');
    }
  } catch (err) {
    setFlash(req, 'error', 'Could not disable API key.');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/keys/:id/enable', requireAuth, requireWriteAccess, (req, res) => {
  const keyId = Number(req.params.id);
  if (!Number.isInteger(keyId)) {
    setFlash(req, 'error', 'Invalid key ID.');
    return res.redirect('/admin/dashboard');
  }
  
  try {
    const result = setApiKeyActive(keyId, true);
    if (result.changes === 0) {
      setFlash(req, 'error', 'API key not found.');
    } else {
      setFlash(req, 'success', 'API key enabled.');
    }
  } catch (err) {
    setFlash(req, 'error', 'Could not enable API key.');
  }
  res.redirect('/admin/dashboard');
});

app.post('/admin/keys/:id/delete', requireAuth, requireWriteAccess, (req, res) => {
  const keyId = Number(req.params.id);
  if (!Number.isInteger(keyId)) {
    setFlash(req, 'error', 'Invalid key ID.');
    return res.redirect('/admin/dashboard');
  }
  
  try {
    const result = deleteApiKey(keyId);
    if (result.changes === 0) {
      setFlash(req, 'error', 'API key not found.');
    } else {
      setFlash(req, 'success', 'API key removed.');
    }
  } catch (err) {
    setFlash(req, 'error', 'Could not remove API key.');
  }
  res.redirect('/admin/dashboard');
});

app.get('/admin/users', requireAuth, requireAdmin, (req, res) => {
  const users = listUsers();
  const canWrite = hasWriteAccess(req.session.user);
  const settings = getSettings();
  res.render('users', {
    users,
    activePage: 'users',
    currentUser: req.session.user,
    canManage: canWrite,
    settings
  });
});

app.post('/admin/users/:id/role', requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.id);
  const requestedRole = typeof req.body.role === 'string' ? req.body.role.trim().toLowerCase() : '';
  const allowedRoles = ['admin', 'read-write', 'read-only'];

  if (!Number.isInteger(userId)) {
    setFlash(req, 'error', 'Invalid user.');
    return res.redirect('/admin/users');
  }

  if (!allowedRoles.includes(requestedRole)) {
    setFlash(req, 'error', 'Unsupported role selection.');
    return res.redirect('/admin/users');
  }

  const targetUser = getUserById(userId);
  if (!targetUser) {
    setFlash(req, 'error', 'User not found.');
    return res.redirect('/admin/users');
  }

  if (targetUser.role === requestedRole) {
    setFlash(req, 'success', 'No changes were needed.');
    return res.redirect('/admin/users');
  }

  if (targetUser.role === 'admin' && requestedRole !== 'admin') {
    const totalAdmins = countAdmins();
    if (totalAdmins <= 1) {
      setFlash(req, 'error', 'Cannot remove the last admin user.');
      return res.redirect('/admin/users');
    }
  }

  updateUserRole(userId, requestedRole);

  if (req.session.user && req.session.user.id === userId) {
    req.session.user.role = requestedRole;
  }

  setFlash(req, 'success', 'User role updated.');
  res.redirect('/admin/users');
});

app.get('/admin/pool', (req, res) => {
  const poolEntries = listPoolEntries({ includeInactive: false }).map((entry) => ({
    address: entry.address,
    score: entry.score != null ? entry.score : 0
  }));
  res.json(poolEntries);
});

app.post('/auth', (req, res) => {
  const { stream } = req.body || {};
  if (!stream) {
    return res.status(400).json({ valid: false, error: 'Missing stream field.' });
  }
  const valid = isValidApiKey(stream.toString());
  if (!valid) {
    return res.status(403).json({ valid: false });
  }
  return res.json({ valid: true, stream_id: generateStreamId(10) });
});

app.post('/admin/auth', (req, res) => {
  const { stream } = req.body || {};
  if (!stream) {
    return res.status(400).json({ valid: false, error: 'Missing stream field.' });
  }
  const valid = isValidApiKey(stream.toString());
  if (!valid) {
    return res.status(403).json({ valid: false });
  }
  return res.json({ valid: true, stream_id: generateStreamId(10) });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { error: err });
});

app.listen(PORT, () => {
  console.log(`Gateway Admin listening on port ${PORT}`);
});
