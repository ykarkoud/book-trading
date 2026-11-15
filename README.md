# Buchtausch / Book Exchange

Walking skeleton for a web platform where registered users exchange books.
Stack: Node.js (LTS) + Express 5 + Nunjucks templates, i18next (German/English),
Knex with SQLite (development/tests) or MySQL/MariaDB (production).

So far it has a health URL, a German/English start page with the basic
layout, a database layer, demo data for previews and customer accounts
(register, log in, log out).

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
src/auth.js      accounts: register/login/logout, sessions, CSRF, scrypt
src/db.js        Knex setup (SQLite / MySQL) and schema init
src/seed.js      demo data (development/DEBUG only)
src/i18n.js      German/English texts and language detection
views/           Nunjucks templates (layout, start page, auth forms)
public/          CSS (served under /static)
tests/           Jest tests
```

## Customer accounts

Visitors can register, log in and log out (German and English pages; the
navigation shows "Anmelden / Registrieren" or "Angemeldet als … · Abmelden").

| Route | What it does |
|---|---|
| `GET /register`, `POST /register` | Create an account with email + password (min. 8 characters), then logged in |
| `GET /login`, `POST /login` | Log in; a wrong password and an unknown email give the same message |
| `POST /logout` | Ends the session (deleted in the database) and clears the cookie |

How it works (`src/auth.js`):

- **Passwords** are hashed with Node's built-in `crypto.scrypt` and a random
  salt per user (format `scrypt$N$r$p$salt$hash`). The plain password is never
  stored or logged. No native packages are needed.
- **Sessions:** a random token in the `sid` cookie (httpOnly, SameSite=Lax,
  `Secure` when `NODE_ENV=production`, 30 days). The `sessions` table stores
  only the SHA-256 hash of the token. A new session is created on every login.
- **CSRF protection:** a random token in the `csrf` cookie is repeated in a
  hidden field of every form and checked on every POST.
- **Database:** tables `users` (email stored lowercase and unique) and
  `sessions`, created by `init(db)` in `src/db.js` for SQLite and MySQL.
- No secret key is needed in code or environment.

All cookies (`sid`, `csrf`, `lang`) are strictly necessary, so no consent
banner is needed.

Try it in the preview: open `/register`, create an account, log out, log in.
With the default in-memory SQLite, accounts are lost when the app restarts;
set `DATABASE_FILE` or use MySQL to keep them.

Still missing for accounts: email verification and password reset (they come
with the email/Nodemailer slice), and login rate limiting. **Before real users
register, the legal pages (Impressum, Datenschutzerklärung) must be added** –
that is the next slice.

## Not built yet (intentionally)

Book and topic lists, matching suggestions, image upload, email and the map.
Their libraries (Multer, sharp, Nodemailer, Leaflet) will be added with those
features. Legal pages (Impressum, Datenschutzerklärung) follow next.

## Open questions for the owner

1. **Hosting cost:** Hostinger managed Node.js hosting needs a Business-level
   plan or higher, which is not free. This conflicts with the "start for free"
   budget and needs a decision.
2. **SQLite persistence:** It is not verified whether SQLite files survive
   redeploys on Hostinger. Until that is checked, plan on MySQL/MariaDB
   (`DB_CLIENT=mysql`) in production.
