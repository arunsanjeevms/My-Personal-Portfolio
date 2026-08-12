# Deployment

Taking the portfolio CMS from a local XAMPP setup to a public Linux server.

```
Internet → Nginx (TLS) → Node/Express (PM2) → MySQL
```

> **This replaces GitHub Pages.** Your site is currently served as static
> files from GitHub Pages, which cannot run Node or MySQL. Once DNS points
> at the VPS, GitHub Pages is no longer serving the domain. Keep the
> repository as a fallback — `index.html` is still a working static copy.

---

## 1. Server preparation

Ubuntu 22.04 or 24.04, 1 GB RAM minimum (2 GB comfortable — `sharp` needs
headroom for image processing).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx mysql-server git ufw fail2ban

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2
```

### A dedicated user

Never run the app as root.

```bash
sudo adduser --system --group --home /var/www/portfolio portfolio
sudo mkdir -p /var/www/portfolio
sudo chown -R portfolio:portfolio /var/www/portfolio
```

---

## 2. Database

```bash
sudo mysql_secure_installation
sudo mysql
```

```sql
CREATE DATABASE portfolio_cms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A dedicated user with only the privileges the app needs. Not root.
CREATE USER 'portfolio'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON portfolio_cms.* TO 'portfolio'@'localhost';
FLUSH PRIVILEGES;
```

`CREATE`/`ALTER`/`DROP` are needed for migrations and restores. If you
prefer, grant them only while migrating and revoke afterwards.

---

## 3. Application

```bash
sudo -u portfolio -H bash
cd /var/www/portfolio
git clone https://github.com/arunsanjeevms/My-Personal-Portfolio.git .
npm ci --omit=dev
```

### Environment

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

```env
NODE_ENV=production
PORT=3000
SITE_URL=https://arunsanjeev.dev
TRUST_PROXY=1

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=portfolio_cms
DB_USER=portfolio
DB_PASSWORD=the-password-you-set

SESSION_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
ENCRYPTION_KEY=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
ANALYTICS_SALT=<node -e "console.log(require('crypto').randomBytes(24).toString('hex'))">

UPLOAD_DIR=/var/www/portfolio/storage/uploads
BACKUP_DIR=/var/www/portfolio/storage/backups
MAX_UPLOAD_MB=20

MYSQLDUMP_PATH=/usr/bin/mysqldump
MYSQL_CLIENT_PATH=/usr/bin/mysql
```

**The app refuses to start in production** if `SESSION_SECRET`,
`ENCRYPTION_KEY`, `ANALYTICS_SALT` or `DB_PASSWORD` are missing. That is
deliberate — a half-secured deploy should fail loudly.

### Migrate and seed

```bash
npm run migrate
npm run seed          # imports the content from index.html
npm run create-admin  # asks for your password privately
```

### Permissions

```bash
exit   # back to your sudo user
sudo chown -R portfolio:portfolio /var/www/portfolio
sudo chmod -R 755 /var/www/portfolio
sudo chmod 600 /var/www/portfolio/.env
sudo chmod -R 775 /var/www/portfolio/storage
```

Uploads live under `storage/`, outside anything Nginx serves directly.
They are delivered through an Express route that sets `nosniff` and a
sandboxing CSP, so an uploaded file can never be executed.

---

## 4. PM2

```bash
sudo -u portfolio -H pm2 start src/server.js --name portfolio-cms \
  --max-memory-restart 400M \
  --time
sudo -u portfolio -H pm2 save
sudo pm2 startup systemd -u portfolio --hp /var/www/portfolio
```

Useful afterwards:

```bash
pm2 logs portfolio-cms
pm2 restart portfolio-cms
pm2 monit
```

**Run exactly one instance.** Cluster mode would run the scheduled jobs
once per worker (duplicate backups, duplicate Medium syncs) and split the
in-process cache. If you ever need multiple workers, move the jobs to a
separate single-instance process first.

---

## 5. Nginx

`/etc/nginx/sites-available/portfolio`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name arunsanjeev.dev www.arunsanjeev.dev;

    # Certbot writes its challenge here; everything else goes to HTTPS.
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name arunsanjeev.dev www.arunsanjeev.dev;

    ssl_certificate     /etc/letsencrypt/live/arunsanjeev.dev/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/arunsanjeev.dev/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    # Must match MAX_UPLOAD_MB in .env, or large uploads fail at the proxy
    # with a confusing 413 before Express ever sees them.
    client_max_body_size 20M;

    access_log /var/log/nginx/portfolio.access.log;
    error_log  /var/log/nginx/portfolio.error.log;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;

    # Static assets straight from disk - these never need to touch Node.
    location /assets/ {
        alias /var/www/portfolio/assets/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location /static/ {
        alias /var/www/portfolio/public/;
        expires 30d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # TRUST_PROXY=1 makes Express read these. Without them every
        # visitor looks like 127.0.0.1 and rate limiting collapses.
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## 6. SSL

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d arunsanjeev.dev -d www.arunsanjeev.dev
sudo systemctl status certbot.timer     # auto-renewal
sudo certbot renew --dry-run
```

Then add the domain in **/admin/domain** and press **Check SSL now** — it
opens a real TLS connection and reads the certificate, so the expiry date
in the dashboard is verified rather than typed in. The nightly job
re-checks it and warns at 90/60/30/14/7/1 days.

---

## 7. DNS

At your registrar, point the domain at the server:

```
A     @      <your-server-ip>
A     www    <your-server-ip>
```

Remove the GitHub Pages records (`185.199.108–111.153`) once the VPS is
serving correctly. Allow up to 24 hours for propagation.

---

## 8. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Port 3000 and MySQL's 3306 must **not** be exposed — Nginx reaches Node
over localhost, and MySQL only listens locally.

---

## 9. Backups

Scheduled backups are built in. Turn them on at
**/admin/sections → Feature flags → Scheduled backups**; they then run
nightly at 02:00 and keep the last 7.

They are written to `storage/backups` **on the same server**, which does
not protect against losing the server. Copy them off:

```bash
# On another machine, nightly
rsync -avz --delete \
  portfolio@your-server:/var/www/portfolio/storage/backups/ \
  ~/portfolio-backups/
```

Restores require typing `RESTORE` to confirm and automatically take a
safety backup of the current database first, so a restore can be undone.

---

## 10. Updating

```bash
sudo -u portfolio -H bash
cd /var/www/portfolio

# Take a backup first - from /admin/backups, or:
npm run migrate:status

git pull
npm ci --omit=dev
npm run migrate
exit

pm2 restart portfolio-cms
```

---

## 11. Verifying the deploy

```bash
curl -I https://arunsanjeev.dev                    # 200, HSTS present
curl -s https://arunsanjeev.dev/healthz            # {"status":"ok",...}
curl -s https://arunsanjeev.dev/robots.txt
curl -I https://arunsanjeev.dev/admin              # 302 to /admin/login
```

Then check:

- [ ] the portfolio looks identical to the old static site
- [ ] all five tabs work, and `/resume` and `/projects` load directly
- [ ] the contact form delivers a message to `/admin/messages`
- [ ] `/admin/analytics` starts recording visits
- [ ] `/admin/system` shows the database connected
- [ ] `/admin/domain` shows a valid certificate after a check
- [ ] a backup can be created and downloaded

---

## Troubleshooting

**502 Bad Gateway** — Node is not running. `pm2 logs portfolio-cms`.

**413 Request Entity Too Large** — `client_max_body_size` in Nginx is
below `MAX_UPLOAD_MB`.

**Everyone appears as 127.0.0.1 in analytics** — `TRUST_PROXY=1` is not
set, or Nginx is not sending `X-Forwarded-For`.

**Sessions drop on every restart** — `SESSION_SECRET` is not set, so a
different derived value is used each boot.

**Uploads fail with a sharp error** — the server is out of memory.
Add swap, or lower `MAX_UPLOAD_MB`.

**Backups fail with ENOENT** — `MYSQLDUMP_PATH` is wrong.
Check with `which mysqldump`.

---

## Security checklist before going live

- [ ] `NODE_ENV=production`
- [ ] All three secrets generated fresh, `.env` at `chmod 600`
- [ ] A dedicated MySQL user with a password, not root
- [ ] The admin password changed from whatever it was set up with
- [ ] `ufw` enabled; only 22, 80 and 443 open
- [ ] HTTPS working, HTTP redirecting to it
- [ ] Backups enabled **and** copied off-server
- [ ] `/admin` returns 302 when signed out
- [ ] `npm test` passes against the deployed configuration
