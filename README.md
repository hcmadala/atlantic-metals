# Atlantic Metals

Node/Express storefront for precious metals with Turso-backed inventory, Cloudinary images, live metal pricing, auth, carts, and orders.

## Inventory model

Inventory is managed from `admin.html` and stored in Turso. Cloudinary only stores image files; Turso stores product data, SKU, type, QOH, and Cloudinary image keys.

Best-practice stock rules:

- A product is in stock only when a matching database row exists and `qoh > 0`.
- Matching uses `sku` first, then falls back to normalized product name for older rows.
- Quantity selectors and checkout cannot exceed QOH.
- Checkout recomputes prices and validates stock server-side.

## Required env

Copy `.env.example` to `.env` and set real values:

```env
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
JWT_SECRET=
ADMIN_EMAILS=
EMAIL_USER=
EMAIL_PASS=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Do not commit `.env`. If it was previously committed, remove it from git tracking and rotate those provider credentials.
