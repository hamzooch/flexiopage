# FlexioPage

A full-stack **SaaS e-commerce platform** (similar to Shopify, YouCan, Ayor.ai) that lets users create online stores and landing pages to sell physical or digital products.

Live: <https://flexiopage.com>. See [DEPLOY.md](./DEPLOY.md) for the VPS deployment guide.

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 14 (App Router), TypeScript, TailwindCSS, Shadcn-style UI, Zustand, Axios |
| **Backend** | Node.js, Express, TypeScript, MongoDB (Mongoose), JWT, REST API |
| **Infra** | Docker, env-based config, file storage abstraction (local + S3) |

## Architecture

- **Multi-tenant**: Each user can create multiple stores.
- **Stores** have: custom domain or subdomain, products, landing pages, orders, analytics.
- Two main folders:
  - **`/boutshop-frontend`** – Next.js SaaS dashboard and public storefronts.
  - **`/boutshop-backend`** – Express REST API.

## Quick Start

### Prerequisites

- Node.js 20+
- MongoDB (local or remote)
- npm or yarn

### 1. Backend

```bash
cd boutshop-backend
cp .env.example .env
# Edit .env: set MONGODB_URI, JWT_SECRET, etc.
npm install
npm run dev
```

API runs at **http://localhost:5000**.

### 2. Frontend

```bash
cd boutshop-frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev
```

App runs at **http://localhost:3000**.

### 3. Docker (full stack)

From repo root:

```bash
cp .env.example .env
# Set JWT_SECRET and optionally FRONTEND_URL, NEXT_PUBLIC_API_URL
docker-compose up -d
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:5000  
- MongoDB: local on 27017

## API Structure

| Path | Description |
|------|-------------|
| `POST /api/auth/register` | Register |
| `POST /api/auth/login` | Login (returns JWT) |
| `GET /api/auth/me` | Current user (JWT) |
| `GET/PATCH /api/users/profile` | Profile |
| `GET /api/users/stores` | User's stores |
| `GET/POST /api/stores` | List / create stores |
| `GET/PATCH /api/stores/:storeId` | Store details / update |
| `GET /api/stores/:storeId/analytics` | Store analytics |
| `GET/POST /api/stores/:storeId/products` | Products CRUD |
| `GET/PATCH/DELETE /api/stores/:storeId/products/:productId` | Single product |
| `GET/POST /api/stores/:storeId/pages` | Landing pages CRUD |
| `GET/PATCH/DELETE /api/stores/:storeId/pages/:pageId` | Single page |
| `GET/POST /api/stores/:storeId/orders` | Orders |
| `GET /api/stores/:storeId/customers` | Customers |
| `GET/POST /api/stores/:storeId/media` | Media list / upload |
| `GET /api/public/store-by-slug/:slug` | Public store by slug |
| `GET /api/public/stores/:storeSlug/products` | Public products |
| `GET /api/public/stores/:storeSlug/pages/:pageSlug` | Public page |

All store-scoped routes require **JWT** and **store ownership** (or admin).

## Features

- **Auth**: Register, login, JWT, password hashing (bcrypt), optional cookie.
- **Users**: Profile, subscription plan, list of stores.
- **Stores**: Create/update, settings, custom domain, theme placeholder.
- **Products**: Physical/digital, price, inventory, variants, images, SEO fields.
- **Landing pages**: Block-based builder (hero, products, testimonials, CTA, features, FAQ), SEO, publish/unpublish.
- **Orders**: Create order, payment status, customer info, fulfillment/tracking.
- **Payments**: Stripe-ready (PaymentIntent), manual payment option.
- **Media**: Upload product images / digital files (local or S3 via env).
- **Analytics**: Store views placeholder, conversion placeholder, sales stats (revenue, orders).
- **Security**: Rate limiting, input validation/sanitization, roles (admin/user).

## Database Models (MongoDB / Mongoose)

- **User** – email, password hash, name, role, avatar.
- **Subscription** – plan, Stripe IDs, store/product limits.
- **Store** – owner, name, slug, subdomain, customDomain, theme, settings.
- **Product** – store, name, slug, type (physical/digital), price, variants, images, digital file.
- **LandingPage** – store, name, slug, sections (type + props), SEO, published.
- **Order** – store, customer, items, totals, payment/fulfillment status.
- **Customer** – store, email, name, address.
- **Media** – store, key, url, filename, mimeType, size.

## Frontend Pages

- **Landing** (`/`) – Marketing + sign up / login.
- **Pricing** (`/pricing`).
- **Login / Register** (`/login`, `/register`).
- **Dashboard** (`/dashboard`) – Overview, Stores, Products, Landing Pages, Orders, Customers, Analytics, Settings.
- **Store settings** – `/dashboard/stores/[storeId]`.
- **Product create/edit** – `/dashboard/products/new`, `/dashboard/products/[id]`.
- **Landing page builder** – `/dashboard/pages`, `/dashboard/pages/new`.
- **Public storefront** – `/store/[storeSlug]`, `/store/[storeSlug]/product/[productSlug]`.

## Deployment (VPS)

1. Set env vars (see backend `.env.example` and frontend `.env.example`).
2. Build and run with Docker: `docker-compose up -d`.
3. Use a reverse proxy (e.g. Nginx/Caddy) for HTTPS and optional custom domains.
4. Point `NEXT_PUBLIC_API_URL` and `FRONTEND_URL` to your public URLs.

## Code Quality

- Modular backend: **routes → controllers → services**; Mongoose models in `/models`.
- Reusable UI components and clear folder structure.
- Comments where logic is non-obvious.

## License

MIT.
