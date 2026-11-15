'use strict';

const path = require('path');
const express = require('express');
const nunjucks = require('nunjucks');
const { i18nMiddleware } = require('./i18n');
const { shouldSeed } = require('./seed');
const { createAuth } = require('./auth');

const ROOT = path.join(__dirname, '..');

/** Build the Express app without listening (used by server.js and tests). */
function createApp({ env = process.env, db } = {}) {
  const app = express();
  app.disable('x-powered-by');

  nunjucks.configure(path.join(ROOT, 'views'), {
    autoescape: true,
    express: app,
    noCache: env.NODE_ENV === 'development',
  });
  app.set('view engine', 'njk');

  // Health check: no DB, no network.
  app.get(['/health', '/health/'], (req, res) => {
    res.type('text/plain').status(200).send('ok');
  });

  app.use('/static', express.static(path.join(ROOT, 'public')));
  app.use(i18nMiddleware);
  // Accounts (register/login/logout), CSRF and session lookup.
  app.use(createAuth({ db, env }));

  app.get('/', async (req, res, next) => {
    try {
      const demo = shouldSeed(env);
      let books = [];
      if (demo && db) {
        books = await db('books').select('id', 'title', 'author').orderBy('id');
      }
      res.render('index.njk', { demo, books });
    } catch (err) {
      next(err);
    }
  });

  return app;
}

module.exports = { createApp };
