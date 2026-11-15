'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb, init } = require('../src/db');
const { seedDemoData, shouldSeed, DEMO_BOOKS } = require('../src/seed');

describe('start page', () => {
  let db;

  beforeEach(async () => {
    db = createDb({});
    await init(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('is German by default with the basic layout', async () => {
    const app = createApp({ env: { NODE_ENV: 'test' }, db });
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<html lang="de">');
    expect(res.text).toContain('Buchtausch');
    expect(res.text).toContain('Bücher tauschen statt kaufen.');
    expect(res.text).toContain('<header');
    expect(res.text).toContain('<main');
    expect(res.text).toContain('<footer');
    expect(res.text).toContain('name="viewport"');
    expect(res.text).toContain('href="?lang=en"');
  });

  test('?lang=en shows English and links back to German', async () => {
    const app = createApp({ env: { NODE_ENV: 'test' }, db });
    const res = await request(app).get('/?lang=en');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html lang="en">');
    expect(res.text).toContain('Book Exchange');
    expect(res.text).toContain('href="?lang=de"');
    expect(res.headers['set-cookie'].join(';')).toMatch(/lang=en/);
  });

  test('Accept-Language: en shows English', async () => {
    const app = createApp({ env: { NODE_ENV: 'test' }, db });
    const res = await request(app).get('/').set('Accept-Language', 'en-US,en;q=0.9');
    expect(res.text).toContain('<html lang="en">');
    expect(res.text).toContain('Swap books instead of buying them.');
  });

  test('lang cookie is respected and unknown languages fall back to German', async () => {
    const app = createApp({ env: { NODE_ENV: 'test' }, db });
    const fromCookie = await request(app).get('/').set('Cookie', 'lang=en');
    expect(fromCookie.text).toContain('<html lang="en">');
    const unknown = await request(app).get('/?lang=fr').set('Accept-Language', 'fr');
    expect(unknown.text).toContain('<html lang="de">');
  });

  test('demo data is not shown in test or production mode', async () => {
    await seedDemoData(db);
    for (const env of [{ NODE_ENV: 'test' }, { NODE_ENV: 'production' }, { NODE_ENV: 'production', DEBUG: '0' }]) {
      const res = await request(createApp({ env, db })).get('/');
      expect(res.status).toBe(200);
      expect(res.text).not.toContain('id="demo-data"');
      expect(res.text).not.toContain(DEMO_BOOKS[0].title);
    }
  });

  test('demo data is shown in development and DEBUG mode', async () => {
    await seedDemoData(db);
    for (const env of [{ NODE_ENV: 'development' }, { NODE_ENV: 'production', DEBUG: '1' }]) {
      const res = await request(createApp({ env, db })).get('/');
      expect(res.text).toContain('id="demo-data"');
      expect(res.text).toContain(DEMO_BOOKS[0].title);
    }
  });

  test('shouldSeed only in development/DEBUG', () => {
    expect(shouldSeed({ NODE_ENV: 'development' })).toBe(true);
    expect(shouldSeed({ DEBUG: 'true' })).toBe(true);
    expect(shouldSeed({ NODE_ENV: 'test' })).toBe(false);
    expect(shouldSeed({ NODE_ENV: 'production' })).toBe(false);
    expect(shouldSeed({ DEBUG: 'false' })).toBe(false);
    expect(shouldSeed({})).toBe(false);
  });

  test('DB init and seed are idempotent on the shared in-memory DB', async () => {
    await init(db);
    await seedDemoData(db);
    await seedDemoData(db);
    const [{ count }] = await db('books').count({ count: '*' });
    expect(Number(count)).toBe(DEMO_BOOKS.length);
  });
});
