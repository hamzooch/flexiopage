# FlexioPage — Deploying on a Hostinger VPS

End-to-end guide to ship FlexioPage on a fresh Ubuntu 22.04 / 24.04 VPS.
Time: ~30 min if the DNS is already pointing to the VPS.

## 1. Prerequisites

- A Hostinger VPS with **≥ 2 GB RAM** and **≥ 20 GB disk**
- A domain name (e.g. `flexiopage.com`)
- Two DNS A records pointing to the VPS IP:
  - `flexiopage.com` → `<VPS_IP>`
  - `api.flexiopage.com` → `<VPS_IP>`
  - (optionally `www.flexiopage.com` → `<VPS_IP>`)
- Your SSH public key on the VPS, or root password

> Wait until `dig +short flexiopage.com` returns your VPS IP before going further —
> Let's Encrypt validates DNS before issuing certificates.

## 2. First-time VPS setup

SSH into the VPS as `root`:

```bash
# System update + tools
apt update && apt upgrade -y
apt install -y git curl ufw certbot

# Install Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Firewall — allow SSH, HTTP, HTTPS only
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Clone the repo
mkdir -p /opt
cd /opt
git clone https://github.com/hamzooch/boutshop.git flexiopage
cd flexiopage

# Copy and edit the environment template
cp .env.production.example .env
nano .env       # → fill in DOMAIN, API_DOMAIN, JWT_SECRET, etc.
```

Generate a strong JWT secret on the VPS:

```bash
openssl rand -hex 64
```

Paste the output as `JWT_SECRET` in `.env`.

## 3. Issue the SSL certificate (once)

Stop anything listening on port 80, then ask certbot for the cert:

```bash
cd /opt/flexiopage
certbot certonly --standalone \
  -d flexiopage.com -d www.flexiopage.com -d api.flexiopage.com \
  --email you@flexiopage.com --agree-tos --no-eff-email
```

> Replace the three `-d` values with **your** domains. Both apex and
> `api.` subdomain need to resolve to this VPS *before* running this.

After success, the certificate lives under `/etc/letsencrypt/live/flexiopage.com/`.

## 4. Update nginx config with your real domain

```bash
nano nginx/conf.d/flexiopage.conf
```

Replace every occurrence of `flexiopage.com` and `api.flexiopage.com` with
your real domain(s). Save and quit.

## 5. Launch the stack

```bash
./deploy.sh
```

This builds the three images (mongo, backend, frontend), brings nginx
up, and prints the public URLs. First build takes ~5 min; subsequent
deploys are ~30 s thanks to the Docker layer cache.

## 6. Seed the first admin user

```bash
docker compose -f docker-compose.prod.yml exec backend \
  node -e "
    require('dotenv').config();
    require('mongoose').connect(process.env.MONGODB_URI).then(async () => {
      const { User } = require('./dist/models/User.model');
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash('CHANGE_ME', 12);
      await User.create({
        email: 'admin@flexiopage.com',
        passwordHash,
        name: 'Admin',
        role: 'admin',
      });
      console.log('Admin created.');
      process.exit(0);
    });
  "
```

> Replace `admin@flexiopage.com` and `CHANGE_ME` with your real credentials.
> Or use the existing script: `npx tsx scripts/seed-admin.ts`.

## 7. Renew SSL certificates automatically

Add a weekly cron (renewal happens at 60 days — Let's Encrypt issues
90-day certs):

```bash
crontab -e
```

Add this line:

```
0 3 * * 0 certbot renew --quiet --deploy-hook "docker compose -f /opt/flexiopage/docker-compose.prod.yml exec nginx nginx -s reload"
```

## 8. Day-to-day operations

| Action | Command |
|---|---|
| Deploy a new commit | `./deploy.sh` |
| Watch logs (all services) | `docker compose -f docker-compose.prod.yml logs -f` |
| Watch only the backend | `docker compose -f docker-compose.prod.yml logs -f backend` |
| Restart one service | `docker compose -f docker-compose.prod.yml restart backend` |
| Mongo shell | `docker compose -f docker-compose.prod.yml exec mongodb mongosh boutshop` |
| Backup Mongo | `docker compose -f docker-compose.prod.yml exec mongodb mongodump --archive --gzip > /opt/backups/$(date +%F).archive.gz` |
| Storage backup | `tar czf /opt/backups/uploads-$(date +%F).tgz $(docker volume inspect flexiopage_backend_uploads -f '{{ .Mountpoint }}')` |

## 9. Troubleshooting

**`502 Bad Gateway`** — backend or frontend container crashed.
Run `docker compose -f docker-compose.prod.yml ps` and check the logs
of the unhealthy service.

**`Storage failed to persist the file`** on uploads — the
`backend_uploads` volume isn't mounted, or `STORAGE_DRIVER=local` but
`UPLOAD_PATH` is wrong. Inside the container:

```bash
docker compose -f docker-compose.prod.yml exec backend ls -la /app/uploads
```

**CORS errors in the browser** — `FRONTEND_URL` in `.env` doesn't
match the URL the browser is hitting. Make sure it's `https://` and the
exact domain (with or without `www.`).

**Uploads return `400 Bad Request`** — was an axios bug fixed in commit
`35d4a042`. If you see it again, check the request's `Content-Type` in
the browser DevTools network tab — it must be `multipart/form-data`,
not `application/json`.

**Out of memory during build** — the frontend Next.js build needs
~1.5 GB RAM. If the VPS is 1 GB, build locally instead and push the
images to a registry, or add a swap file:

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```
