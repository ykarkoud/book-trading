'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb, init } = require('../src/db');
const { hashPassword, verifyPassword } = require('../src/auth');

const PASSWORD = 'correct horse battery';

function csrfFrom(html) {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  if (!m) throw new Error('no csrf field in page');
  return m[1];
}

function cookieValue(res, name) {
  const cookies = res.headers['set-cookie'] || [];
  for (const c of cookies) {
    const m = new RegExp(`^${name}=([^;]*)`).exec(c);
    if (m) return m[1];
  }
  return null;
}

describe('customer accounts', () => {
  let db;
  let app;

  beforeEach(async () => {
    db = createDb({});
    await init(db);
    app = createApp({ env: { NODE_ENV: 'test' }, db });
  });

  afterEach(async () => {
    await db.destroy();
  });

  /** Open a form with an agent (keeps cookies) and return the csrf token. */
  async function openForm(agent, path) {
    const res = await agent.get(path);
    expect(res.status).toBe(200);
    return csrfFrom(res.text);
  }

  async function register(agent, email, password = PASSWORD, lang = 'de') {
    const _csrf = await openForm(agent, `/register?lang=${lang}`);
    return agent.post(`/register?lang=${lang}`).type('form').send({ _csrf, email, password });
  }

  async function login(agent, email, password, lang = 'de') {
    const _csrf = await openForm(agent, `/login?lang=${lang}`);
    return agent.post(`/login?lang=${lang}`).type('form').send({ _csrf, email, password });
  }

  describe('AC-1: registration', () => {
    test('register form renders in German and English', async () => {
      const de = await request(app).get('/register?lang=de');
      expect(de.status).toBe(200);
      expect(de.text).toContain('<html lang="de">');
      expect(de.text).toContain('Konto erstellen');
      expect(de.text).toContain('name="_csrf"');
      expect(de.text).toContain('autocomplete="new-password"');

      const en = await request(app).get('/register?lang=en');
      expect(en.status).toBe(200);
      expect(en.text).toContain('<html lang="en">');
      expect(en.text).toContain('Create an account');

      const loginEn = await request(app).get('/login?lang=en');
      expect(loginEn.status).toBe(200);
      expect(loginEn.text).toContain('autocomplete="current-password"');
    });

    test('successful registration logs the user in (German)', async () => {
      const agent = request.agent(app);
      const res = await register(agent, 'Anna@Example.org');
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe('/?lang=de');
      const sid = cookieValue(res, 'sid');
      expect(sid).toBeTruthy();
      expect(res.headers['set-cookie'].join(';')).toMatch(/sid=[^;]+;.*HttpOnly/i);

      const home = await agent.get('/?lang=de');
      expect(home.text).toContain('Angemeldet als');
      expect(home.text).toContain('anna@example.org');
      expect(home.text).toContain('action="/logout?lang=de"');
      expect(home.text).not.toContain('href="/register?lang=de"');

      const user = await db('users').first();
      expect(user.email).toBe('anna@example.org');
    });

    test('successful registration logs the user in (English)', async () => {
      const agent = request.agent(app);
      const res = await register(agent, 'ben@example.org', PASSWORD, 'en');
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe('/?lang=en');
      const home = await agent.get('/?lang=en');
      expect(home.text).toContain('Logged in as');
      expect(home.text).toContain('ben@example.org');
    });

    test('logged-in user visiting /register or /login is redirected home', async () => {
      const agent = request.agent(app);
      await register(agent, 'anna@example.org');
      const r = await agent.get('/register?lang=de');
      expect(r.status).toBe(303);
      const l = await agent.get('/login?lang=de');
      expect(l.status).toBe(303);
    });
  });

  describe('AC-2: registration validation', () => {
    test('duplicate email (any letter case) is rejected', async () => {
      await register(request.agent(app), 'anna@example.org');
      const res = await register(request.agent(app), '  ANNA@Example.ORG ');
      expect(res.status).toBe(400);
      expect(res.text).toContain('Für diese E-Mail-Adresse gibt es bereits ein Konto');
      expect(cookieValue(res, 'sid')).toBeNull();
      const [{ count }] = await db('users').count({ count: '*' });
      expect(Number(count)).toBe(1);
    });

    test('password shorter than 8 characters is rejected', async () => {
      const res = await register(request.agent(app), 'anna@example.org', 'short12');
      expect(res.status).toBe(400);
      expect(res.text).toContain('Das Passwort muss mindestens 8 Zeichen lang sein.');
      expect(res.text).toContain('value="anna@example.org"');
      expect(await db('users').first()).toBeUndefined();
    });

    test('short password message in English', async () => {
      const res = await register(request.agent(app), 'anna@example.org', '1234567', 'en');
      expect(res.status).toBe(400);
      expect(res.text).toContain('The password must be at least 8 characters long.');
    });

    test('invalid email is rejected', async () => {
      const res = await register(request.agent(app), 'not-an-email');
      expect(res.status).toBe(400);
      expect(res.text).toContain('Bitte gib eine gültige E-Mail-Adresse ein.');
      expect(await db('users').first()).toBeUndefined();
    });

    test('exactly 8 characters is accepted', async () => {
      const res = await register(request.agent(app), 'anna@example.org', '12345678');
      expect(res.status).toBe(303);
    });
  });

  describe('AC-3: login', () => {
    beforeEach(async () => {
      await register(request.agent(app), 'anna@example.org');
    });

    test('correct password logs in (email case-insensitive)', async () => {
      const agent = request.agent(app);
      const res = await login(agent, 'Anna@Example.org', PASSWORD);
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe('/?lang=de');
      expect(cookieValue(res, 'sid')).toBeTruthy();
      const home = await agent.get('/');
      expect(home.text).toContain('anna@example.org');
      expect(home.text).toContain('Angemeldet als');
    });

    test('wrong password and unknown email give the same generic error', async () => {
      const wrong = await login(request.agent(app), 'anna@example.org', 'wrong password');
      const unknown = await login(request.agent(app), 'nobody@example.org', 'wrong password');
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      for (const res of [wrong, unknown]) {
        expect(res.text).toContain('E-Mail-Adresse oder Passwort ist falsch.');
        expect(res.text).not.toContain('bereits ein Konto');
        expect(cookieValue(res, 'sid')).toBeNull();
      }
      const strip = (html) => html.replace(/value="[^"]*"/g, '');
      expect(strip(wrong.text)).toBe(strip(unknown.text));
    });

    test('generic error in English', async () => {
      const res = await login(request.agent(app), 'anna@example.org', 'nope nope', 'en');
      expect(res.status).toBe(401);
      expect(res.text).toContain('Email address or password is incorrect.');
    });
  });

  describe('AC-4: logout', () => {
    test('logout ends the session and the old cookie no longer logs in', async () => {
      const agent = request.agent(app);
      const reg = await register(agent, 'anna@example.org');
      const sid = cookieValue(reg, 'sid');
      expect(sid).toBeTruthy();

      const before = await request(app).get('/').set('Cookie', `sid=${sid}`);
      expect(before.text).toContain('anna@example.org');

      const home = await agent.get('/?lang=de');
      const _csrf = csrfFrom(home.text);
      const out = await agent.post('/logout?lang=de').type('form').send({ _csrf });
      expect(out.status).toBe(303);
      expect(out.headers.location).toBe('/?lang=de');
      expect(out.headers['set-cookie'].join(';')).toMatch(/sid=;/);

      const after = await agent.get('/');
      expect(after.text).not.toContain('anna@example.org');
      expect(after.text).toContain('href="/login?lang=de"');

      const replay = await request(app).get('/').set('Cookie', `sid=${sid}`);
      expect(replay.text).not.toContain('anna@example.org');
      expect(replay.text).not.toContain('Angemeldet als');

      const [{ count }] = await db('sessions').count({ count: '*' });
      expect(Number(count)).toBe(0);
    });

    test('expired sessions do not log in', async () => {
      const agent = request.agent(app);
      const reg = await register(agent, 'anna@example.org');
      const sid = cookieValue(reg, 'sid');
      await db('sessions').update({ expires_at: Date.now() - 1000 });
      const res = await request(app).get('/').set('Cookie', `sid=${sid}`);
      expect(res.text).not.toContain('anna@example.org');
    });
  });

  describe('AC-5: CSRF', () => {
    test.each(['/register', '/login', '/logout'])('POST %s without csrf token is rejected', async (path) => {
      const res = await request(app).post(`${path}?lang=de`).type('form')
        .send({ email: 'anna@example.org', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(res.text).toContain('Das Formular ist abgelaufen oder ungültig.');
    });

    test('POST with a token that does not match the cookie is rejected', async () => {
      const agent = request.agent(app);
      await openForm(agent, '/register?lang=de');
      const res = await agent.post('/register?lang=de').type('form')
        .send({ _csrf: 'x'.repeat(43), email: 'anna@example.org', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(await db('users').first()).toBeUndefined();
    });

    test('token from the form without the matching cookie is rejected', async () => {
      const page = await request(app).get('/register?lang=de');
      const _csrf = csrfFrom(page.text);
      const res = await request(app).post('/register?lang=de').type('form')
        .send({ _csrf, email: 'anna@example.org', password: PASSWORD });
      expect(res.status).toBe(403);
      expect(await db('users').first()).toBeUndefined();
    });

    test('logout without a valid token keeps the session', async () => {
      const agent = request.agent(app);
      await register(agent, 'anna@example.org');
      const res = await agent.post('/logout').type('form').send({ _csrf: 'wrong' });
      expect(res.status).toBe(403);
      const home = await agent.get('/');
      expect(home.text).toContain('anna@example.org');
    });

    test('csrf cookie is httpOnly and SameSite=Lax', async () => {
      const res = await request(app).get('/register');
      const c = res.headers['set-cookie'].find((s) => s.startsWith('csrf='));
      expect(c).toMatch(/HttpOnly/i);
      expect(c).toMatch(/SameSite=Lax/i);
    });
  });

  describe('AC-6 support: password storage', () => {
    test('password is stored as a salted scrypt hash, not in plain text', async () => {
      await register(request.agent(app), 'anna@example.org');
      await register(request.agent(app), 'ben@example.org');
      const users = await db('users').select('password_hash');
      for (const u of users) {
        expect(u.password_hash).not.toContain(PASSWORD);
        expect(u.password_hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
      }
      expect(users[0].password_hash).not.toBe(users[1].password_hash);
      const sessions = await db('sessions').select('token_hash');
      for (const s of sessions) expect(s.token_hash).toMatch(/^[0-9a-f]{64}$/);
    });

    test('hashPassword / verifyPassword', async () => {
      const h = await hashPassword('geheim123');
      expect(await verifyPassword('geheim123', h)).toBe(true);
      expect(await verifyPassword('geheim124', h)).toBe(false);
      expect(await verifyPassword('geheim123', 'garbage')).toBe(false);
    });
  });

  describe('AC-7: existing behaviour', () => {
    test('/health/ still returns ok', async () => {
      const res = await request(app).get('/health/');
      expect(res.status).toBe(200);
      expect(res.text).toBe('ok');
    });

    test('start page shows login and register links for visitors', async () => {
      const res = await request(app).get('/?lang=en');
      expect(res.status).toBe(200);
      expect(res.text).toContain('href="/login?lang=en"');
      expect(res.text).toContain('href="/register?lang=en"');
    });

    test('init is idempotent with the account tables', async () => {
      await init(db);
      expect(await db.schema.hasTable('users')).toBe(true);
      expect(await db.schema.hasTable('sessions')).toBe(true);
    });
  });
});
