const crypto = require('crypto');
const db = require('./db');

const SESSION_COOKIE = 'u4session';
const SESSION_MAX_AGE_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), candidate);
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  return token;
}

function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function pruneSessions() {
  db.prepare(
    `DELETE FROM sessions WHERE created_at < datetime('now', ?)`
  ).run(`-${SESSION_MAX_AGE_DAYS} days`);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function sessionCookie(token, { clear = false } = {}) {
  const maxAge = clear ? 0 : SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
  // Hinter HTTPS zusätzlich "; Secure" anhängen.
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}`;
}

// Hängt req.user / req.sessionToken an, falls ein gültiges Session-Cookie vorliegt.
function sessionMiddleware(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) {
    const user = db
      .prepare(
        `SELECT u.id, u.username FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ? AND s.created_at >= datetime('now', ?)`
      )
      .get(token, `-${SESSION_MAX_AGE_DAYS} days`);
    if (user) {
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  next();
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  pruneSessions,
  sessionCookie,
  sessionMiddleware,
  requireAuth,
};
