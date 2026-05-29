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
apt install -y git curl ufw

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
git clone https://github.com/hamzooch/flexiopage.git
cd flexiopage

# Copy and edit the environment template
cp .env.production.example .env
nano .env       # → fill in PLATFORM_APEX, CADDY_ADMIN_EMAIL, JWT_SECRET, etc.
```

Generate a strong JWT secret on the VPS:

```bash
openssl rand -hex 64
```

Paste the output as `JWT_SECRET` in `.env`. Key Caddy-related variables:

| Var | Required | Example |
|---|---|---|
| `PLATFORM_APEX` | yes | `flexiopage.com` |
| `CADDY_ADMIN_EMAIL` | yes | `admin@flexiopage.com` (Let's Encrypt contact) |

## 3. SSL is automatic — no manual certbot

Caddy issues and renews every Let's Encrypt certificate on its own via
the HTTP-01 challenge — no DNS API tokens, no custom builds, stock
`caddy:2-alpine` image. On the **very first** request to a hostname,
Caddy fetches a fresh cert in a few seconds, then caches it on the
persistent `caddy_data` volume.

Three cert categories are issued:

1. `flexiopage.com` + `www.flexiopage.com` — at boot.
2. `api.flexiopage.com` — at boot.
3. **Every vendor subdomain** (`<store>.flexiopage.com`) AND **every
   seller custom domain** — issued on demand the first time a visitor
   hits the host, **only after** Caddy checks the backend's
   `/internal/cert-ask?domain=…` endpoint. The gate accepts a domain
   when it's the platform apex / a `*.PLATFORM_APEX` subdomain, or
   when a `Store` document has `customDomain === domain` and
   `customDomainVerified === true`. This prevents random hostnames
   from burning the LE rate limit.

> Make sure ports 80 AND 443 are open on the VPS firewall, and that
> nothing else is listening on them on the host — Caddy needs both.

## 4. Launch the stack

```bash
./deploy.sh
```

This builds the images (mongo, backend, frontend), brings Caddy up
last, and prints the public URLs. First build takes ~5 min; subsequent
deploys are ~30 s thanks to the Docker layer cache.

## 5. Seed the first admin user

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

## 6. Vendor custom domains — how it works in production

A seller configures a custom domain from the dashboard
(`/dashboard/integrations` → tab **Domaine**). The flow is:

1. Seller types `theirshop.com` and clicks **Enregistrer**.
2. UI shows the DNS records to copy (CNAME → `stores.flexiopage.com`).
3. Seller adds the records at their registrar, comes back, clicks
   **Vérifier le DNS**. Backend runs an `nslookup`; on success the
   store gets `customDomainVerified: true`.
4. The first browser hitting `https://theirshop.com` triggers Caddy:
   - Caddy GETs `http://backend:5000/internal/cert-ask?domain=theirshop.com`
   - Backend returns `200 OK` (the domain is verified)
   - Caddy obtains a Let's Encrypt cert (HTTP-01, ~3 s)
   - Connection is upgraded, page renders.
5. Renewals happen silently in the background.

No SSH, no admin action, no per-vendor config file.

## 7. Day-to-day operations

| Action | Command |
|---|---|
| Deploy a new commit | `./deploy.sh` |
| Watch logs (all services) | `docker compose -f docker-compose.prod.yml logs -f` |
| Watch only the backend | `docker compose -f docker-compose.prod.yml logs -f backend` |
| Restart one service | `docker compose -f docker-compose.prod.yml restart backend` |
| Mongo shell | `docker compose -f docker-compose.prod.yml exec mongodb mongosh flexiopage` |
| Backup Mongo | `docker compose -f docker-compose.prod.yml exec mongodb mongodump --archive --gzip > /opt/backups/$(date +%F).archive.gz` |
| Storage backup | `tar czf /opt/backups/uploads-$(date +%F).tgz $(docker volume inspect flexiopage_backend_uploads -f '{{ .Mountpoint }}')` |

## 8. Troubleshooting

**`502 Bad Gateway`** — backend or frontend container crashed.
Run `docker compose -f docker-compose.prod.yml ps` and check the logs
of the unhealthy service.

**Custom domain shows `ERR_CERT_COMMON_NAME_INVALID`** — Caddy hasn't
issued the cert yet. Check three things:
1. The store actually has `customDomainVerified: true` in Mongo.
2. `curl http://backend:5000/internal/cert-ask?domain=<the-domain>` from
   the VPS returns `200`.
3. Caddy logs (`docker compose -f docker-compose.prod.yml logs -f caddy`)
   for ACME errors — usually a DNS issue or LE rate-limit hit.

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
