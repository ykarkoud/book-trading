'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createDb, init } = require('../src/db');

describe('health URL', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = createDb({});
    await init(db);
    app = createApp({ env: { NODE_ENV: 'test' }, db });
  });

  afterAll(async () => {
    await db.destroy();
  });

  test.each(['/health/', '/health'])('GET %s returns 200 ok', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });
});
