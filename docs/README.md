# Portfolio CMS

A custom content management system behind [arunsanjeev.dev](https://arunsanjeev.dev),
built with Node.js, Express and MySQL/MariaDB.

The public portfolio keeps its original design, animations and markup.
The CMS replaces the hardcoded content in `index.html` with
database-driven content and an admin panel.

> **Status: all phases complete.**
> The public site renders from the database, the admin panel manages every
> part of it, and 50 automated tests pass. See [Roadmap](#roadmap).

---

## Table of contents

- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Architecture](#architecture)
- [Security](#security)
- [npm scripts](#npm-scripts)
- [Roadmap](#roadmap)
- [Troubleshooting](#troubleshooting)
- [Production deployment](#production-deployment)

---

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 20+ | Tested on 24.11.0 |
| MySQL or MariaDB | MySQL 8+ / MariaDB 10.4+ | XAMPP ships MariaDB 10.4 |
| npm | 9+ | |

The schema is written to run on **both** MariaDB and MySQL. It avoids
MySQL-8-only syntax (`utf8mb4_0900_*` collations, functional indexes,
`CHECK (JSON_VALID(...))`) so a local XAMPP database and a production
MySQL server stay compatible.

---

## Quick start

```bash
npm install
npm run setup          # creates .env, checks the DB, runs migrations
npm run create-admin   # creates your sign-in, asks for the password privately
npm run dev            # http://localhost:3000
```

Admin panel: <http://localhost:3000/admin>

### Using XAMPP

1. Open the XAMPP Control Panel and **start MySQL**.
2. Defaults already match XAMPP: host `127.0.0.1`, port `3306`, user
   `root`, empty password.
3. `npm run setup` creates the `portfolio_cms` database if it does not exist.

If port 3306 is taken by another MySQL install, check which one is
listening before starting XAMPP:

```bash
netstat -ano | findstr :3306
```

---

## Environment variables

Copy `.env.example` to `.env` — or let `npm run setup` do it, which also
generates the secrets. **`.env` is git-ignored and must never be committed.**

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | | `development` or `production` |
| `PORT` | | HTTP port, default `3000` |
| `SITE_URL` | | Public base URL, no trailing slash |
| `TRUST_PROXY` | prod | Set to `1` behind Nginx so real client IPs are read |
| `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | yes | Database connection |
| `SESSION_SECRET` | **prod** | Signs session cookies. 48+ random bytes |
| `ENCRYPTION_KEY` | **prod** | 64 hex chars. Encrypts TOTP secrets at rest |
| `ANALYTICS_SALT` | **prod** | Salts IP hashes so they cannot be reversed |
| `ADMIN_PATH` | | Admin URL prefix, default `/admin` |
| `UPLOAD_DIR` `BACKUP_DIR` `MAX_UPLOAD_MB` | | File storage |
| `SMTP_*` `MAIL_*` | | Outbound email (also configurable in the admin) |
| `LOG_LEVEL` `LOG_DIR` | | Logging |
| `MYSQLDUMP_PATH` `MYSQL_CLIENT_PATH` | | Needed for backups |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

**The app refuses to start in production** if `SESSION_SECRET`,
`ENCRYPTION_KEY`, `ANALYTICS_SALT` or `DB_PASSWORD` are missing. In
development it derives placeholders and warns.

---

## Database

### Migrations

`database/migrations/*.sql` is the source of truth. They run in filename
order and are recorded in `schema_migrations` with a checksum, so an
already-applied file that gets edited is reported rather than silently
ignored.

```bash
npm run migrate          # apply pending migrations
npm run migrate:status   # show applied vs pending
npm run schema:dump      # regenerate database/schema.sql from the live DB
```

| File | Contents |
|---|---|
| `001_identity.sql` | roles, permissions, users, 2FA, sessions, login attempts, activity logs |
| `002_content.sql` | media, profile, skills, projects, experience, education, certifications, achievements, services, social links, navigation, page sections |
| `003_blog_interaction.sql` | blog, contact messages, subscribers, notifications |
| `004_settings.sql` | site settings, SEO, theme variables, feature flags, custom code, redirects |
| `005_analytics_ops.sql` | analytics, domains, SSL, backups, job history |
| `006_baseline_data.sql` | roles, permissions, settings, theme and flag defaults |

`database/schema.sql` is a **generated** snapshot for reference. Do not
edit it by hand.

Migrations are written to be re-runnable (`CREATE TABLE IF NOT EXISTS`,
`INSERT IGNORE`, `ON DUPLICATE KEY UPDATE`) because MySQL and MariaDB
implicitly commit on DDL — a mid-file failure can leave earlier tables in
place, and re-running must be safe.

### Roles and permissions

| Role | Level | Access |
|---|---|---|
| Super Admin | 100 | Everything, including users, custom code, backups and security |
| Admin | 80 | All content, media, settings, SEO, analytics |
| Editor | 50 | Content and media, read the inbox |
| Viewer | 10 | Read-only dashboard, analytics, activity logs |

28 permissions across six groups. Super Admin is unconditionally
allowed so the owner cannot lock themselves out of their own site.

---

## Architecture

```
src/
├── app.js              Express assembly (middleware order is security-relevant)
├── server.js           startup, config validation, graceful shutdown
├── config/
│   ├── env.js          typed config + production validation
│   ├── database.js     mysql2 pool, prepared statements, transactions
│   └── adminNav.js     sidebar definition, shared with search
├── controllers/        HTTP layer only
├── middleware/         security headers, session, CSRF, auth, rate limits, errors
├── repositories/       all SQL lives here
├── services/           business logic (auth, settings, activity, health)
├── utils/              logger, errors, crypto, cache, view helpers
└── validators/         express-validator rules

views/
├── admin/              dashboard, system
├── auth/               login, change password
├── errors/             400, 401, 403, 404, 409, 429, 500, 503
└── partials/admin/     head, sidebar, topbar, flash, foot

public/admin/           admin CSS and JS (served at /static)
assets/                 the original portfolio's CSS, JS and images (untouched)
database/               migrations + generated schema
scripts/                setup, migrate, create-admin, seed, schema:dump
storage/                uploads and backups (git-ignored, outside the web root)
```

### Layering rules

- Controllers never write SQL. Repositories never handle HTTP.
- `BaseRepository` binds every **value** as a `?` placeholder. **Identifiers**
  (table, column, sort direction) cannot be placeholders in SQL, so they are
  checked against a per-repository allowlist before a query is built —
  request input can never reach the SQL text.
- Settings, feature flags and theme variables are cached in process and
  invalidated on write. A database outage falls back to the last known
  good values instead of taking the public site down.

### Admin panel

Server-rendered EJS with hand-written CSS built on the portfolio's own
design tokens (`--orange-yellow-crayola`, `--eerie-black-1`, Poppins).
No CSS framework — the public site does not use one, and the admin needs
about 20 KB of rules. Vanilla JS for the shell: sidebar, dropdowns,
toasts, confirmation dialogs, double-submit guards.

---

## Security

| Area | Implementation |
|---|---|
| Passwords | bcrypt, cost 12. Length-first policy (12+ chars). Never logged or echoed back into a form |
| Sessions | MySQL-backed, `httpOnly` + `sameSite=lax` + `secure` in production. ID regenerated on login (session fixation). Rolling idle timeout **and** an absolute deadline |
| Login throttling | Two axes: per account (locks one account) and per IP (stops one source spraying many accounts). Successful logins are not counted against the limit |
| Account enumeration | Unknown accounts still run a bcrypt comparison against a dummy hash, so timing does not reveal existence. The failure message is identical either way |
| CSRF | Synchroniser token in the session, required on every unsafe method via `_csrf` or `X-CSRF-Token`. Minted lazily so anonymous page views do not create session rows |
| Authorisation | `requirePermission()` on every route. Hidden sidebar links are presentation only — the route enforces independently |
| SQL injection | Prepared statements everywhere, identifier allowlists, no string-built SQL |
| Headers | Helmet + CSP allowlisting only the origins the site already uses (unpkg ionicons, Google Fonts, Maps embed). HSTS, `frame-ancestors: none`, Permissions-Policy |
| Uploads | Served from `storage/`, outside the web root, through a route that sets `nosniff` and a sandboxing CSP |
| Errors | Stack traces never reach the browser in production. Only errors marked `expose` show their own message |
| Logging | Separate `app` / `security` / `admin` / `error` channels. A redaction list strips passwords, tokens, secrets and raw IPs as a backstop |
| Audit | Every admin action writes to `activity_logs` with a before/after diff, actor, hashed IP and user agent. Sensitive fields are excluded from the diff |

### Privacy

**No raw IP address is ever written to the database.**

- Rate limiting and audit records use `sha256(ip + ANALYTICS_SALT)`.
- Analytics uses `sha256(ip + user-agent + salt-of-the-day)`, so a
  visitor is countable within a day but cannot be linked across days or
  reversed to an address.
- Country is stored as a 2-letter code. No city, no coordinates.
- Retention is configurable and enforced by a cleanup job.

---

## npm scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with nodemon |
| `npm start` | Production server |
| `npm run setup` | First-time setup: `.env`, DB check, migrations |
| `npm run migrate` | Apply pending migrations |
| `npm run migrate:status` | Show applied vs pending |
| `npm run create-admin` | Create an admin account interactively |
| `npm run seed` | Import content from index.html (`-- --force` to overwrite) |
| `npm run schema:dump` | Regenerate `database/schema.sql` |
| `npm test` | Test suite - 50 tests |

---

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 | Analysis and migration plan | done |
| 2 | Server, schema, auth, RBAC, admin shell | done |
| 3 | Content CRUD + migration of index.html into the database | done |
| 4 | Media library, settings, SEO, theme, sections; public site rendered from the DB | done |
| 5 | Contact inbox, blog + Medium sync, analytics, activity logs, notifications | done |
| 6 | Domains, SSL monitoring, backups, scheduled jobs | done |
| 7 | Security hardening, tests, deployment docs | done |


### Known limitations

Stated plainly rather than left for you to discover:

- The CSP still allows `'unsafe-inline'` for styles and scripts, because
  the original portfolio and the theme-override block rely on inline
  style. A nonce-based policy would be stricter.
- Two-factor authentication has the schema, encrypted secret storage and
  backup-code table in place, but no UI to enable it yet. It is not
  claimed as working.
- Users and roles exist and are enforced, but there is no screen for
  creating extra accounts — use `npm run create-admin`.
- **Cluster mode is not supported.** The scheduled jobs and the
  in-process cache assume a single Node process; running several workers
  would duplicate backups and Medium syncs.
- Domain management is a tracker plus a genuine live SSL check. It cannot
  renew a domain or change DNS — that needs a registrar API integration,
  which is stubbed for later but not implemented.

---

## Troubleshooting

**`Cannot reach the database server`**
MySQL is not running. Start it from the XAMPP Control Panel. Confirm with
`netstat -ano | findstr :3306`.

**`Port 3000 is already in use`**
Another process holds the port. Change `PORT` in `.env`, or find it with
`netstat -ano | findstr :3000` and stop that PID.

**`The database has no schema yet`**
Run `npm run migrate`.

**`ER_CANT_CREATE_TABLE ... errno: 121`**
A duplicate foreign-key constraint name. InnoDB requires FK names to be
unique across the whole database, not just per table.

**Migration reports a file changed after it was applied**
Migrations are immutable. Add a new migration file instead of editing an
applied one.

**Session expired immediately after signing in**
`SESSION_SECRET` changed between restarts. In development a derived
secret is used; set an explicit one in `.env` to keep sessions stable.

---

## Production deployment

Full step-by-step instructions are in **[DEPLOYMENT.md](./DEPLOYMENT.md)**.

Target architecture:

```
Internet → Nginx (TLS) → Node/Express (PM2) → MySQL
```

Checklist:

1. `NODE_ENV=production`, `TRUST_PROXY=1`, `SITE_URL=https://...`
2. Real `SESSION_SECRET`, `ENCRYPTION_KEY`, `ANALYTICS_SALT`, and a
   database user with a password (the app refuses to start otherwise)
3. A dedicated MySQL user with only the privileges it needs — not `root`
4. `npm ci --omit=dev && npm run migrate`
5. PM2 with `--max-memory-restart`, started via a systemd unit
6. Nginx reverse proxy with `proxy_set_header X-Forwarded-For`, TLS from
   Certbot, and `client_max_body_size` matching `MAX_UPLOAD_MB`
7. `storage/` writable by the app user, not served directly by Nginx
8. Firewall: expose 80/443 only; keep 3306 and the Node port local
9. Scheduled database backups with off-server copies

Full Nginx, PM2 and systemd configuration is written in Phase 7.

---

## License

Private and unlicensed. All rights reserved.
