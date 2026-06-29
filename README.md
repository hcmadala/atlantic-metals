# Atlantic Metals

Precious metals e-commerce storefront. Customers buy gold, silver, platinum, and palladium coins, bars, and rounds at live spot-derived prices. Node.js + Express backend, Turso (libSQL) for persistence, Cloudinary for images, vanilla JS frontend with no build step.

**[Live →](https://atlantic-metals.onrender.com)**

---

## Design constraints

The architecture is shaped by a few deliberate choices, not accidents:

**SQLite/Turso over a relational cloud DB.** Turso gives a zero-config, HTTP-accessible SQLite database with a generous free tier. At current traffic levels, SQLite's write serialization is a correctness feature for inventory operations, not a bottleneck. Migrating to Postgres is straightforward if write throughput becomes an issue.

**Single-process backend.** The price polling worker runs as a `setInterval` inside the Express process. This avoids distributed state, cache coherency between instances, and inter-process communication — at the cost of operational coupling between the web tier and the polling worker. That tradeoff is acceptable for a single-developer project at this scale.

**Static product catalog.** Products are defined in a JS file loaded by both the browser and the server. Adding a product is a deployment, not a database write. This keeps the catalog under version control and ensures frontend/backend definitions can't drift.

**No build step on the frontend.** Vanilla JS served directly as static files. No bundler, no transpiler, no asset pipeline. Adds some duplication (shared constants exist in both runtimes) in exchange for operational simplicity.

---

## Architecture

```
Browser (Vanilla JS, multi-page)
  │
  │  fetch()
  ▼
Express
  ├── HTML pages       server-side partial assembly (partials/)
  ├── /healthz         DB connectivity check
  ├── /auth/*          registration, login, verification
  ├── /cart            server-side cart persistence
  ├── /orders          checkout, order history
  ├── /profile/*       addresses, saved cards, password
  ├── /prices          spot price + 24h history + NY close
  └── /api/coins/*     inventory CRUD, image upload (admin)
         │
         ├── Turso (libSQL)     persistence
         ├── Cloudinary         image storage
         └── gold-api.com       spot price feed (5-min poll)
```

Shared chrome (ticker, nav, cart drawer, footer) lives in `partials/` and is stitched into each HTML page by `lib/page-renderer.js` before the response is sent. No client-side layout fetch, no build step.

### Frontend layout

| Path | Purpose |
|---|---|
| `partials/` | Reusable HTML fragments (ticker, navbar, metal menu, cart, footer) |
| `js/core/` | Shared client modules (site ticker, cart, auth, pricing, search) |
| `js/pages/` | Page-specific scripts |
| `css/core/` | Global styles |
| `css/pages/` | Page-specific styles |

---

## Pricing

Spot prices are fetched from gold-api.com every five minutes, cached in memory, and written to a rolling 24-hour `price_history` table. The price a customer pays is:

```
wire_price   = spot × (1 + margin) − bulk_discount
credit_price = wire_price × 1.04
```

Margins and bulk discount tiers are encoded as constants (`MARGINS`, `BULK_TIERS`) shared between runtimes — the server reads them from `js/core/pricing.js` via `require`, the browser loads the same file as a script tag. Keeping pricing logic as constants rather than database rows means changes go through code review and can't be corrupted by the admin UI.

The client computes prices locally for display, reading spot from `localStorage`. At checkout, the server recomputes from its in-memory cache and ignores the client-supplied price entirely. Spot can move between page load and order submission; the server's recalculation at order time is the authoritative value.

```javascript
// POST /orders — client-submitted prices are discarded
async function buildOrderItems(rawItems) {
  // Resolves each item by SKU → fallback to normalized name match
  // Validates QOH against current DB state
  // Calls calcWirePrice() from server's live spot cache
}
```

---

## Inventory

Checkout is a three-step sequence:

1. Fetch current QOH for all requested coins
2. Validate quantities — short stock fails the entire order before any write
3. Insert the order, then batch-decrement inventory

```sql
UPDATE coins SET qoh = qoh - ? WHERE id = ? AND qoh >= ?
```

The guard clause makes each decrement a no-op if stock was already exhausted. SQLite's write lock serializes concurrent checkouts at the DB layer, so two requests for the same last unit queue up — the second either decrements remaining stock or the guard fires.

The current code doesn't check `rowsAffected` after the batch. If the guard fires, the decrement is silently skipped but the order row is still inserted. Under SQLite serialization this race is unlikely in practice, but the correct fix is to verify affected row counts per statement and reject the order if any decrement misses.

---

## Shared catalog

`js/core/data.js` exports a plain JS array of product definitions. The browser loads it as a `<script>` tag. The server evaluates it at startup:

```javascript
function loadProducts() {
  const src = fs.readFileSync(`${__dirname}/js/core/data.js`, "utf8");
  const ctx = vm.createContext({});
  return vm.runInContext(`${src}; products;`, ctx);
}
```

One definition, two runtimes, no sync step. The consequence is that adding a product is a deploy operation. For 15 SKUs that's reasonable; if the catalog grew significantly you'd move products to a database table.

`scripts/inventory-smoke.js` (run via `npm test`) validates the catalog file before it ships: required fields, enum values for metal/type, no duplicate SKUs.

---

## Images

Only the Cloudinary `public_id` is stored. All size variants, srcsets, and placeholders are derived from it at request time:

```javascript
// utils/cloudinary.js
const getImageUrl = (id, width = 400) =>
  cloudinary.url(id, { width, crop: "fit", quality: "auto", fetch_format: "auto", secure: true });

const getSrcSet = (id, widths = [400, 800, 1200]) =>
  widths.map(w => `${getImageUrl(id, w)} ${w}w`).join(", ");

// ~1–2KB blur-up placeholder
const getPlaceholderUrl = (id) =>
  cloudinary.url(id, { width: 30, crop: "fit", quality: 1, effect: "blur:400", fetch_format: "auto", secure: true });
```

Storing the key rather than URLs means layout changes (new breakpoints, different crops, format preferences) are a function change with no migration. `fetch_format: "auto"` delegates format negotiation to Cloudinary — AVIF for supporting browsers, WebP otherwise, JPEG as fallback. Each coin has two independent image slots (obverse, reverse).

---

## Authentication

JWT issued into an `httpOnly`, `SameSite=Lax` cookie, 7-day expiry. A few implementation decisions:

**Soft deletes.** `DELETE /auth/account` sets `deleted_at`; the row is never removed. Re-registering with the same email reuses the existing row with reset credentials. Hard deletion would require either cascading order deletes or nullable `user_id` on orders — both are worse than retaining the row.

**Email uniqueness is enforced in application code, not schema.** The register handler checks for an active account before inserting. Two concurrent requests with the same email could both pass the check. Fix: `CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL`. SQLite supports partial indexes. This is an open issue.

**Verification expiry checked in SQL.** The query filters on `verify_expires > datetime('now')` rather than fetching the row and comparing in JS. Clock handling belongs at the DB layer.

**Saved cards** store brand, last-4, expiry, and cardholder name only — no PANs, no CVV. Regex-validated before write.

---

## Failure semantics

**Price feed outage.** If gold-api.com is unreachable, the polling worker logs the error and exits the interval tick. The in-memory cache continues serving its last known values with no TTL eviction and no staleness signal to callers. Hardcoded fallback values (`gold: ~$4700`, etc.) cover a cold-start cache, but a sustained outage will silently serve stale spot to all price calculations, including order repricing at checkout. There is no circuit breaker, no secondary feed, and no user-facing staleness indicator.

**Cache restart behavior.** The in-memory cache is process-local. On restart, the first `/prices` request blocks on an upstream API call; subsequent requests serve cache. `price_history` data persists in Turso and is available immediately after restart. If multiple instances were deployed, each would maintain an independent cache — N instances, N upstream poll streams, and no guarantee prices are consistent across requests routed to different instances. A shared cache (Redis) would be needed before horizontal scaling.

**Checkout under degraded pricing.** Checkout proceeds if the cache has any data, regardless of age. An order placed during a feed outage uses whatever spot value was last successfully fetched. The customer receives an order at a price that may not reflect current market conditions. The system has no mechanism to detect this or hold orders pending feed recovery.

**Inventory decrement failure.** As described above: if the batch `UPDATE` guard fires on any line item (stock exhausted by a concurrent order), the order is still recorded. There is no transactional rollback across the order INSERT and inventory decrements.

**Email delivery failure.** If SMTP fails during registration, the verification code is already written to the database but the email never arrives. The user can request a resend (`POST /auth/resend-verification`), but there is no retry on the original send and no dead-letter queue.

**Cloudinary upload failure.** If the Cloudinary stream fails mid-upload, `multer` has already accepted and buffered the file in memory. The coin record retains its previous `image_key` (or null). No partial state is written to the DB; the failure surface is limited to the upload itself.

---

## Data model

**`users`** — bcrypt-hashed password (`cost: 8`), soft delete via `deleted_at`, addresses and card tokens as JSON columns.

**`orders`** — line items stored as a JSON snapshot at write time. This preserves exactly what the customer paid regardless of subsequent catalog edits or deletions. Historical orders don't join against current product state.

**`carts`** — `user_id` is the primary key; the table is written with `ON CONFLICT(user_id) DO UPDATE`. On login, the server cart is the source of truth. Items that exist locally but not on the server are merged in; server items are not overwritten by local state.

**`price_history`** — rolling 24-hour window. Trimmed on every write cycle with `DELETE WHERE timestamp < datetime('now', '-24 hours')`. Indexed on `(metal_type, timestamp)`.

**`ny_close`** — one row per `(metal_type, close_date)`, upserted within a 10-minute window around 5:00 PM America/New_York on weekdays. Used for change-from-close display in the price ticker. Spot API calls and `price_history` writes pause from Friday 5:00 PM NY through Sunday 6:00 PM NY.

**`coins`** — live inventory. Matched to the static product catalog by `sku` (exact), then normalized name (lowercase, strip years, collapse whitespace). The normalization function exists in both the server and the frontend independently — a maintenance surface introduced by the no-build-step constraint.

---

## Setup

```bash
git clone https://github.com/your-username/atlantic-metals
cd atlantic-metals
npm install
cp .env.example .env
npm start
```

Schema is created and missing columns migrated on startup. The migration runner uses `PRAGMA table_info` to detect existing columns and applies `ALTER TABLE` statements conditionally. No migration files, no external tooling.

```bash
# Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Validate product catalog schema
npm test
```

Email verification is skipped (503) if `EMAIL_USER` and `EMAIL_PASS` are unset. Image upload is unavailable without Cloudinary credentials. Both degrade independently — the rest of the app functions normally.

**Environment variables:**

| Variable | Notes |
|---|---|
| `TURSO_DATABASE_URL` | `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | Read/write token from Turso dashboard |
| `JWT_SECRET` | Min 32 random bytes |
| `ADMIN_EMAILS` | Comma-separated; checked on every admin route, not cached |
| `EMAIL_USER` / `EMAIL_PASS` | Gmail address + App Password |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Required for image upload |
| `RENDER_EXTERNAL_URL` | Set on Render; enables keep-alive self-ping every 10 min |
| `NODE_ENV=production` | Enables secure cookies and caches rendered HTML in memory |
| `PORT` | HTTP port (Render sets this automatically) |

---

## Open issues

**Inventory decrement result unchecked.** Affected row counts should be verified after `db.batch()` and the order rejected if any decrement missed.

**Missing partial unique index on `users.email`.** Concurrent registrations with the same address can produce duplicate rows. `CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL` closes it.

**`server.js` is large.** Auth, pricing, cart, orders, profile, DB initialization, and the background worker share a single file. The natural split is `routes/`, `services/pricing.js`, `services/price-worker.js`, `db/index.js`.

---

## What changes next

Separating the price worker into its own process is the most useful architectural change — not for throughput, but so a web tier deploy doesn't interrupt price recording and a worker crash doesn't affect request handling. On Render that's a second free-tier service sharing the same Turso database.

Moving the product catalog to a `products` table decouples operations from deployments. Right now, adding a product requires a code change and a deploy. That's acceptable at the current catalog size but becomes friction as it grows.

TypeScript would make the shared pricing constants safe across runtimes. Currently a mistake in `MARGINS` or `BULK_TIERS` propagates silently to both the server calculation and the client display; typed schemas would surface it at compile time.

Automated browser tests (Playwright) for register → verify → checkout would catch regressions in the multi-page flow that smoke scripts cannot.

---

## Stack

| | |
|---|---|
| Runtime | Node.js 18+, Express 5 |
| Database | Turso (libSQL / SQLite) |
| Images | Cloudinary SDK v2 |
| Auth | `jsonwebtoken`, `bcryptjs` |
| Email | `nodemailer` + Gmail SMTP |
| Upload | `multer` (memory storage) |
| Security | `helmet`, `express-rate-limit` |
| Frontend | Vanilla JS (`js/core` + `js/pages`), server-side HTML partials |
| Hosting | Render |
| Pricing feed | gold-api.com (XAU / XAG / XPT / XPD) |