'use strict';

/**
 * Customer accounts: registration, login, logout.
 * - Passwords: Node's built-in crypto.scrypt with a random salt per user.
 * - Sessions: random token in an httpOnly cookie "sid"; the DB stores only
 *   its SHA-256 hash.
 * - CSRF: random token in an httpOnly cookie "csrf", repeated in a hidden
 *   form field and compared on every POST (double-submit cookie).
 * No secret is needed in code or env.
 */

const crypto = require('crypto');
const express = require('express');
const { readCookie } = require('./i18n');

const SESSION_COOKIE = 'sid';
const CSRF_COOKIE = 'csrf';
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 3600 * 1000;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_EMAIL = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Returns "scrypt$N$r$p$saltB64$hashB64". */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(password), salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const key = await scryptAsync(String(password), Buffer.from(saltB64, 'base64'), {
    N: Number(N), r: Number(r), p: Number(p), keylen: expected.length,
  });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Used to spend the same time when the email is unknown (no account enumeration by timing).
let dummyHashPromise = null;
function dummyHash() {
  if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
  return dummyHashPromise;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cookieOptions(env, maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    ...(maxAge ? { maxAge } : {}),
  };
}

function createAuth({ db, env = process.env }) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // CSRF token: one per browser, stored in a cookie and put into each form.
  router.use((req, res, next) => {
    let token = readCookie(req.headers.cookie, CSRF_COOKIE);
    if (!token || !/^[A-Za-z0-9_-]{32,}$/.test(token)) {
      token = crypto.randomBytes(32).toString('base64url');
      res.cookie(CSRF_COOKIE, token, cookieOptions(env));
    }
    res.locals.csrfToken = token;
    next();
  });

  // Session: look up the logged-in user.
  router.use(async (req, res, next) => {
    res.locals.user = null;
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (!token || !db) return next();
    const row = await db('sessions')
      .join('users', 'users.id', 'sessions.user_id')
      .where('sessions.token_hash', sha256(token))
      .andWhere('sessions.expires_at', '>', Date.now())
      .first('users.id as id', 'users.email as email', 'sessions.id as session_id');
    if (row) {
      req.user = row;
      res.locals.user = { id: row.id, email: row.email };
    }
    next();
  });

  function renderForm(res, mode, { status = 200, errors = [], email = '' } = {}) {
    res.set('Cache-Control', 'no-store');
    res.status(status).render('auth.njk', { mode, errors, email });
  }

  // Every POST must carry the CSRF token from the form.
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const sent = req.body && req.body._csrf;
    if (safeEqual(sent, readCookie(req.headers.cookie, CSRF_COOKIE))) return next();
    const mode = req.path.startsWith('/register') ? 'register' : 'login';
    const email = req.body && typeof req.body.email === 'string' ? req.body.email.slice(0, MAX_EMAIL) : '';
    return renderForm(res, mode, { status: 403, errors: [res.locals.t('errCsrf')], email });
  });

  async function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    // Housekeeping: drop expired sessions.
    await db('sessions').where('expires_at', '<=', now).del();
    await db('sessions').insert({ user_id: userId, token_hash: sha256(token), expires_at: now + SESSION_MS });
    res.cookie(SESSION_COOKIE, token, cookieOptions(env, SESSION_MS));
  }

  function home(res) {
    return res.redirect(303, `/?lang=${res.locals.lang}`);
  }

  router.get('/register', (req, res) => {
    if (res.locals.user) return home(res);
    renderForm(res, 'register');
  });

  router.post('/register', async (req, res) => {
    const t = res.locals.t;
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const errors = [];
    if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) errors.push(t('errEmailInvalid'));
    if (password.length < MIN_PASSWORD) errors.push(t('errPasswordShort'));
    else if (password.length > MAX_PASSWORD) errors.push(t('errPasswordLong'));
    if (errors.length) return renderForm(res, 'register', { status: 400, errors, email: email.slice(0, MAX_EMAIL) });

    const existing = await db('users').where({ email }).first('id');
    if (existing) return renderForm(res, 'register', { status: 400, errors: [t('errEmailTaken')], email });

    const passwordHash = await hashPassword(password);
    let id;
    try {
      // SQLite and MySQL both return [insertedId] without "returning".
      const inserted = await db('users').insert({ email, password_hash: passwordHash, created_at: Date.now() });
      id = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];
    } catch (err) {
      // Unique constraint (two registrations at the same moment).
      if (await db('users').where({ email }).first('id')) {
        return renderForm(res, 'register', { status: 400, errors: [t('errEmailTaken')], email });
      }
      throw err;
    }
    await startSession(res, id);
    return home(res);
  });

  router.get('/login', (req, res) => {
    if (res.locals.user) return home(res);
    renderForm(res, 'login');
  });

  router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = typeof req.body.password === 'string' ? req.body.password.slice(0, MAX_PASSWORD) : '';
    const user = email && email.length <= MAX_EMAIL
      ? await db('users').where({ email }).first('id', 'password_hash')
      : null;
    const ok = await verifyPassword(password, user ? user.password_hash : await dummyHash());
    if (!user || !ok) {
      return renderForm(res, 'login', { status: 401, errors: [res.locals.t('errLogin')], email: email.slice(0, MAX_EMAIL) });
    }
    // New session on every login (prevents session fixation).
    const old = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (old) await db('sessions').where('token_hash', sha256(old)).del();
    await startSession(res, user.id);
    return home(res);
  });

  router.post('/logout', async (req, res) => {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await db('sessions').where('token_hash', sha256(token)).del();
    res.clearCookie(SESSION_COOKIE, cookieOptions(env));
    res.locals.user = null;
    return home(res);
  });

  return router;
}

module.exports = { createAuth, hashPassword, verifyPassword, normalizeEmail, SESSION_COOKIE, CSRF_COOKIE };
