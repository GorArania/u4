const path = require('path');
const express = require('express');

const db = require('./lib/db');
const auth = require('./lib/auth');
const { buildBundle, listGameFiles } = require('./lib/bundle');

const PORT = process.env.PORT || 3000;
const MAX_SAVE_BYTES = 16 * 1024 * 1024;

const app = express();
app.use(express.json());
app.use(auth.sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

auth.pruneSessions();

// ---------------------------------------------------------------- Anmeldung

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || !/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({
      error: 'Benutzername: 3–32 Zeichen, nur Buchstaben, Ziffern, _ . -',
    });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Passwort: mindestens 6 Zeichen.' });
  }

  let userId;
  try {
    const result = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(username, auth.hashPassword(password));
    userId = result.lastInsertRowid;
  } catch (err) {
    if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
      return res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
    }
    throw err;
  }

  res.setHeader('Set-Cookie', auth.sessionCookie(auth.createSession(userId)));
  res.status(201).json({ username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user =
    typeof username === 'string'
      ? db.prepare('SELECT * FROM users WHERE username = ?').get(username)
      : null;
  if (!user || typeof password !== 'string' || !auth.verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Benutzername oder Passwort falsch.' });
  }
  res.setHeader('Set-Cookie', auth.sessionCookie(auth.createSession(user.id)));
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  if (req.sessionToken) auth.destroySession(req.sessionToken);
  res.setHeader('Set-Cookie', auth.sessionCookie('', { clear: true }));
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  const save = db
    .prepare('SELECT updated_at FROM saves WHERE user_id = ?')
    .get(req.user.id);
  res.json({
    username: req.user.username,
    gameFilesPresent: listGameFiles().length > 0,
    saveUpdatedAt: save ? save.updated_at : null,
  });
});

// ------------------------------------------------------------- Spiel-Bundle

// Liefert das .jsdos-Bundle: Originaldateien aus game/, überlagert mit dem
// Spielstand des angemeldeten Benutzers.
app.get('/api/bundle', auth.requireAuth, (req, res) => {
  const save = db
    .prepare('SELECT data FROM saves WHERE user_id = ?')
    .get(req.user.id);
  let bundle;
  try {
    bundle = buildBundle(save ? save.data : null);
  } catch (err) {
    if (err.code === 'EMPTY_GAME_DIR') {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Cache-Control', 'no-store');
  res.send(bundle);
});

// -------------------------------------------------------------- Spielstände

app.put(
  '/api/save',
  auth.requireAuth,
  express.raw({ type: () => true, limit: MAX_SAVE_BYTES }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Leerer Spielstand.' });
    }
    db.prepare(
      `INSERT INTO saves (user_id, data, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(req.user.id, req.body);
    const { updated_at } = db
      .prepare('SELECT updated_at FROM saves WHERE user_id = ?')
      .get(req.user.id);
    res.json({ ok: true, updatedAt: updated_at });
  }
);

// Spielstand als Datei herunterladen (Backup).
app.get('/api/save', auth.requireAuth, (req, res) => {
  const save = db
    .prepare('SELECT data FROM saves WHERE user_id = ?')
    .get(req.user.id);
  if (!save) return res.status(404).json({ error: 'Kein Spielstand vorhanden.' });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="u4-spielstand-${req.user.username}.zip"`
  );
  res.send(save.data);
});

app.delete('/api/save', auth.requireAuth, (req, res) => {
  db.prepare('DELETE FROM saves WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ------------------------------------------------------------------- Fehler

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

app.listen(PORT, () => {
  console.log(`Ultima IV läuft auf http://localhost:${PORT}`);
  if (listGameFiles().length === 0) {
    console.log('Hinweis: game/ ist leer – bitte die originalen DOS-Dateien dorthin kopieren.');
  }
});
