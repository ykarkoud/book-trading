# Buchtausch / Book Exchange

Walking skeleton for a web platform where registered users exchange books.
Stack: Node.js (LTS) + Express 5 + Nunjucks templates, i18next (German/English),
Knex with SQLite (development/tests) or MySQL/MariaDB (production).

This is only the foundation: a health URL, a German/English start page with the
basic layout, a minimal database layer and demo data for previews.

## Prerequisites

- Node.js LTS (20 or newer, tested target: 22)
- npm (comes with Node.js)

## Install

```bash
npm install
```

## Test

```bash
npm test
```

Tests use Jest + supertest against an in-memory SQLite database. They need no
network, no database server and no running app.

## Run

```bash
npm start          # production-like, no demo data
npm run dev        # NODE_ENV=development: shows demo data
```

The app listens on `0.0.0.0:$PORT` (default `8000`). Open:

- `http://localhost:8000/` – start page (German by default)
- `http://localhost:8000/?lang=en` – English
- `http://localhost:8000/health/` – returns `ok`

Language is chosen by `?lang=de|en`, then the `lang` cookie, then the
browser's `Accept-Language`, falling back to German.

### Environment variables

| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on (default 8000) |
| `NODE_ENV` | `development` shows demo data; set `production` in production |
| `DEBUG` | `1`/`true` also shows demo data – **never set in production** |
| `DB_CLIENT` | `mysql` to use MySQL/MariaDB; otherwise SQLite |
| `DATABASE_FILE` | SQLite file path; default is in-memory (data is lost on restart) |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL/MariaDB connection |

**No secrets belong in the code.** Put credentials in a local `.env` file
(ignored by git, load it with your shell or tooling) or in the Hostinger panel's
environment variables.

Demo data is shown only when `NODE_ENV=development` or `DEBUG` is on. The live
preview (`.ai-dev/run.toml`) sets both on purpose; production must set neither.

## Project layout

```
src/server.js    start-up (DB init, demo seed, listen)
src/app.js       Express app factory (routes)
src/db.js        Knex setup (SQLite / MySQL) and schema init
src/seed.js      demo data (development/DEBUG only)
src/i18n.js      German/English texts and language detection
views/           Nunjucks templates (layout + start page)
public/          CSS (served under /static)
tests/           Jest tests
```

## Not built yet (intentionally)

Registration/login, book and topic lists, matching suggestions, image upload,
email and the map. Their libraries (Passport, Multer, sharp, Nodemailer,
Leaflet) will be added with those features. Legal pages (Impressum,
Datenschutzerklärung) also follow with the first product workflow.

## Open questions for the owner

1. **Hosting cost:** Hostinger managed Node.js hosting needs a Business-level
   plan or higher, which is not free. This conflicts with the "start for free"
   budget and needs a decision.
2. **SQLite persistence:** It is not verified whether SQLite files survive
   redeploys on Hostinger. Until that is checked, plan on MySQL/MariaDB
   (`DB_CLIENT=mysql`) in production.
