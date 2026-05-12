require("dotenv").config();
const express          = require("express");
const bcrypt           = require("bcryptjs");
const jwt              = require("jsonwebtoken");
const cookieParser     = require("cookie-parser");
const { createClient } = require("@libsql/client");
const crypto           = require("crypto");
const nodemailer       = require("nodemailer");
const fs               = require("fs");
const vm               = require("vm");
const coinsRouter      = require("./routes/coins");

const app = express();
app.use(express.static(__dirname));
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET  = process.env.JWT_SECRET;
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET environment variable.");
  process.exit(1);
}

// ─── Turso / LibSQL Client ────────────────────────────────────────────────────
const db = createClient({
  url:       process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

// ─── Email Transporter ────────────────────────────────────────────────────────
const hasEmailConfig = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
const transporter = hasEmailConfig
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  : null;

if (transporter) {
  transporter.verify((error) => {
    if (error) console.error("Email transporter error:", error.message);
    else        console.log("Email transporter ready");
  });
} else {
  console.warn("Email transporter disabled. Set EMAIL_USER and EMAIL_PASS to send verification codes.");
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendVerificationEmail(email, firstName, code) {
  if (!transporter) {
    throw new Error("Email transporter is not configured");
  }

  try {
    await transporter.sendMail({
      from: '"Atlantic Metals" <no-reply@atlanticmetals.ca>',
      to: email,
      subject: "Verify your Atlantic Metals account",
      html: `
        <div style="font-family:monospace;background:#111;color:#fff;padding:32px;border-radius:12px;max-width:480px">
          <h2 style="color:#c9a84c;margin-top:0">Atlantic Metals</h2>
          <p>Hi ${escapeHTML(firstName)},</p>
          <p>Your verification code is:</p>
          <div style="background:#0a0a0a;border:1px solid #333;border-radius:8px;padding:20px;text-align:center;font-size:32px;letter-spacing:10px;color:#c9a84c;font-weight:bold;margin:20px 0">
            ${code}
          </div>
          <p style="color:#888;font-size:13px">This code expires in 15 minutes. If you did not create an account you can ignore this email.</p>
        </div>
      `
    });
    console.log("Email sent to", email);
  } catch (err) {
    console.error("Email send error:", err.message);
  }
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(String(email || "").toLowerCase());
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function parseJSON(v, fallback = []) {
  if (!v) return fallback;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return fallback; }
  }
  return v;
}

function loadProducts() {
  const source = fs.readFileSync(`${__dirname}/js/data.js`, "utf8");
  const context = {};
  vm.createContext(context);
  const loadedProducts = vm.runInContext(`${source}; products;`, context);
  return Array.isArray(loadedProducts) ? loadedProducts : [];
}

const products = loadProducts();
const productsById = new Map(products.map(product => [Number(product.id), product]));
const productsBySku = new Map(products.map(product => [String(product.sku || ""), product]).filter(([sku]) => sku));

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const MARGINS = {
  gold:      { coins: 0.04, rounds: 0.03, bars: 0.025 },
  silver:    { coins: 0.12, rounds: 0.11, bars: 0.10  },
  platinum:  { coins: 0.06, rounds: 0.05, bars: 0.04  },
  palladium: { coins: 0.06, rounds: 0.05, bars: 0.04  }
};

const BULK_TIERS = {
  gold: [
    { min: 1,   max: 9,        discount: 0 },
    { min: 10,  max: 19,       discount: 50 },
    { min: 20,  max: 49,       discount: 75 },
    { min: 50,  max: 99,       discount: 100 },
    { min: 100, max: Infinity, discount: 125 }
  ],
  silver: [
    { min: 1,    max: 24,       discount: 0 },
    { min: 25,   max: 99,       discount: 0.5 },
    { min: 100,  max: 499,      discount: 1 },
    { min: 500,  max: 1499,     discount: 1.5 },
    { min: 1500, max: Infinity, discount: 2 }
  ],
  platinum: [
    { min: 1,   max: 9,        discount: 0 },
    { min: 10,  max: 24,       discount: 25 },
    { min: 25,  max: 49,       discount: 37 },
    { min: 50,  max: 99,       discount: 50 },
    { min: 100, max: Infinity, discount: 65 }
  ],
  palladium: [
    { min: 1,   max: 9,        discount: 0 },
    { min: 10,  max: 24,       discount: 0.5 },
    { min: 25,  max: 49,       discount: 1 },
    { min: 50,  max: 99,       discount: 1.5 },
    { min: 100, max: Infinity, discount: 2 }
  ]
};

function getSpotPrice(metal) {
  const codeMap = { gold: "XAU", silver: "XAG", platinum: "XPT", palladium: "XPD" };
  const fallback = { gold: 4700, silver: 73, platinum: 2000, palladium: 1530 };
  return cache.data?.[codeMap[metal]] || fallback[metal] || 0;
}

function calcWirePrice(metal, type, quantity) {
  const spot = getSpotPrice(metal);
  const margin = MARGINS[metal]?.[type] ?? 0.05;
  const tiers = BULK_TIERS[metal] || BULK_TIERS.gold;
  const tier = tiers.find(t => quantity >= t.min && quantity <= t.max) || tiers[0];
  return Math.max(0, spot + (spot * margin) - tier.discount);
}

async function buildOrderItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;

  const { rows: coinRows } = await db.execute({
    sql: "SELECT id, sku, name, qoh FROM coins",
    args: []
  });
  const coinsByName = new Map(coinRows.map(coin => [normalizeName(coin.name), coin]));
  const coinsBySku = new Map(coinRows.filter(coin => coin.sku).map(coin => [coin.sku, coin]));

  return rawItems.map(item => {
    const productId = Number(item.productId ?? item.id);
    const product = productsById.get(productId);
    const qty = Math.max(1, Math.min(9999, parseInt(item.qty, 10) || 0));

    if (!product || qty < 1) return null;

    const coin = coinsBySku.get(product.sku) || coinsByName.get(normalizeName(product.name));
    if (!coin || Number(coin.qoh || 0) < qty) return null;

    const price = calcWirePrice(product.metal, product.type, qty);
    return {
      productId: product.id,
      coinId: coin?.id || null,
      name: product.name,
      metal: product.metal,
      type: product.type,
      qty,
      price
    };
  }).filter(Boolean);
}

// ─── Create / Migrate Tables ─────────────────────────────────────────────────
//
// Key differences from MySQL:
//   AUTO_INCREMENT → INTEGER PRIMARY KEY AUTOINCREMENT
//   VARCHAR/TINYINT/DECIMAL/JSON/SMALLINT → TEXT / INTEGER / REAL
//   TIMESTAMP DEFAULT CURRENT_TIMESTAMP → TEXT DEFAULT (datetime('now'))
//   JSON_ARRAY() default → '[]'
//   UNIQUE KEY name (cols) → UNIQUE(cols) inside CREATE TABLE
//   INDEX inside CREATE TABLE → separate CREATE INDEX statement
//
async function initDB() {
  // Create all tables in a single batch write
  await db.batch([
    {
      sql: `CREATE TABLE IF NOT EXISTS users (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name     TEXT NOT NULL,
        last_name      TEXT NOT NULL,
        email          TEXT NOT NULL,
        phone          TEXT,
        password       TEXT NOT NULL,
        verified       INTEGER DEFAULT 0,
        verify_code    TEXT,
        verify_expires TEXT,
        addresses      TEXT,
        saved_cards    TEXT,
        deleted_at     TEXT NULL DEFAULT NULL,
        created_at     TEXT DEFAULT (datetime('now'))
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS orders (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        items      TEXT NOT NULL,
        total      REAL NOT NULL,
        status     TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS carts (
        user_id    INTEGER PRIMARY KEY,
        items      TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS price_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT NOT NULL,
        price      REAL NOT NULL,
        timestamp  TEXT DEFAULT (datetime('now'))
      )`,
      args: []
    },
    {
      // Separate CREATE INDEX (not supported inline in SQLite CREATE TABLE)
      sql: `CREATE INDEX IF NOT EXISTS idx_metal_time ON price_history(metal_type, timestamp)`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS ny_close (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        metal_type TEXT NOT NULL,
        price      REAL NOT NULL,
        close_date TEXT NOT NULL,
        UNIQUE(metal_type, close_date)
      )`,
      args: []
    },
    {
      sql: `CREATE TABLE IF NOT EXISTS coins (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        sku        TEXT UNIQUE,
        name       TEXT NOT NULL,
        slug       TEXT UNIQUE NOT NULL,
        metal      TEXT NOT NULL,
        product_type TEXT NOT NULL DEFAULT 'coins',
        mint       TEXT,
        weight_oz  REAL,
        purity     TEXT,
        year       INTEGER,
        qoh        INTEGER NOT NULL DEFAULT 0,
        image_key  TEXT,
        image_key_2 TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      args: []
    }
  ], "write");

  // ─── Migrations (for any existing Turso installs missing columns) ──────────
  // SQLite uses PRAGMA table_info instead of information_schema
  const { rows: userColRows } = await db.execute({ sql: "PRAGMA table_info(users)", args: [] });
  const existingUserColumns = userColRows.map(r => r.name);

  const migrations = [];
  if (!existingUserColumns.includes("phone"))       migrations.push({ sql: "ALTER TABLE users ADD COLUMN phone TEXT",                         args: [] });
  if (!existingUserColumns.includes("addresses"))   migrations.push({ sql: "ALTER TABLE users ADD COLUMN addresses TEXT",                     args: [] });
  if (!existingUserColumns.includes("saved_cards")) migrations.push({ sql: "ALTER TABLE users ADD COLUMN saved_cards TEXT",                   args: [] });
  if (!existingUserColumns.includes("deleted_at"))  migrations.push({ sql: "ALTER TABLE users ADD COLUMN deleted_at TEXT NULL DEFAULT NULL",  args: [] });

  const { rows: coinColRows } = await db.execute({ sql: "PRAGMA table_info(coins)", args: [] });
  const existingCoinColumns = coinColRows.map(r => r.name);
  if (!existingCoinColumns.includes("image_key_2")) migrations.push({ sql: "ALTER TABLE coins ADD COLUMN image_key_2 TEXT", args: [] });
  if (!existingCoinColumns.includes("qoh"))         migrations.push({ sql: "ALTER TABLE coins ADD COLUMN qoh INTEGER NOT NULL DEFAULT 0", args: [] });
  if (!existingCoinColumns.includes("sku"))         migrations.push({ sql: "ALTER TABLE coins ADD COLUMN sku TEXT", args: [] });
  if (!existingCoinColumns.includes("product_type")) migrations.push({ sql: "ALTER TABLE coins ADD COLUMN product_type TEXT NOT NULL DEFAULT 'coins'", args: [] });

  if (migrations.length > 0) await db.batch(migrations, "write");

  for (const product of products) {
    await db.execute({
      sql: `UPDATE coins
            SET sku = COALESCE(sku, ?), product_type = COALESCE(NULLIF(product_type, ''), ?)
            WHERE lower(name) = lower(?)`,
      args: [product.sku, product.type, product.name]
    });
  }

  // Note: email uniqueness is enforced in code (non-deleted rows only), so no
  // UNIQUE index on email is needed — same logic as before, just no DROP INDEX
  // step because SQLite never had one.

  console.log("Turso (SQLite) tables ready");
}

initDB()
  .then(() => {
    console.log("Turso connected");
    startPriceHistoryWorker();
  })
  .catch(err => {
    console.error("Turso error:", err.message);
    console.error("Check TURSO_DATABASE_URL and TURSO_AUTH_TOKEN environment variables.");
  });

// Keep Render free tier awake
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    fetch(process.env.RENDER_EXTERNAL_URL + "/auth/me").catch(() => {});
  }, 10 * 60 * 1000);
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const token = req.cookies.token || req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid session" });
  }
}

function adminRequired(req, res, next) {
  if (!req.user) {
    return authRequired(req, res, () => adminRequired(req, res, next));
  }
  if (!isAdminEmail(req.user?.email)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function setAuthCookie(res, token) {
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────
app.post("/auth/register", async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  if (!firstName || !lastName || !email || !password)
    return res.status(400).json({ error: "All fields required" });
  if (!transporter)
    return res.status(503).json({ error: "Email verification is not configured" });

  try {
    const { rows: active } = await db.execute({
      sql:  "SELECT id FROM users WHERE email = ? AND deleted_at IS NULL",
      args: [email]
    });
    if (active.length > 0)
      return res.status(400).json({ code: "EMAIL_EXISTS", error: "Email already registered" });

    const { rows: deleted } = await db.execute({
      sql:  "SELECT id FROM users WHERE email = ? AND deleted_at IS NOT NULL",
      args: [email]
    });

    const hashed  = await bcrypt.hash(password, 8);
    const code    = crypto.randomInt(100000, 999999).toString();
    // SQLite stores dates as ISO strings — use toISOString() instead of a Date object
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

    if (deleted.length > 0) {
      await db.execute({
        sql: `UPDATE users SET
                first_name = ?, last_name = ?, password = ?,
                verified = 0, verify_code = ?, verify_expires = ?,
                phone = NULL, addresses = NULL, saved_cards = NULL,
                deleted_at = NULL
              WHERE id = ?`,
        args: [firstName, lastName, hashed, code, expires, deleted[0].id]
      });
    } else {
      await db.execute({
        sql:  "INSERT INTO users (first_name, last_name, email, password, verify_code, verify_expires) VALUES (?, ?, ?, ?, ?, ?)",
        args: [firstName, lastName, email, hashed, code, expires]
      });
    }

    await sendVerificationEmail(email, firstName, code);
    res.json({ success: true, message: "Verification code sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Verify Email ─────────────────────────────────────────────────────────────
app.post("/auth/verify-email", async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code)
    return res.status(400).json({ error: "Email and code required" });

  try {
    // datetime('now') replaces MySQL's NOW() for SQLite comparisons
    const { rows } = await db.execute({
      sql:  "SELECT * FROM users WHERE email = ? AND verify_code = ? AND verify_expires > datetime('now') AND deleted_at IS NULL",
      args: [email, code]
    });
    if (rows.length === 0)
      return res.status(400).json({ error: "Invalid or expired code. Request a new one." });

    const user = rows[0];
    await db.execute({
      sql:  "UPDATE users SET verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?",
      args: [user.id]
    });

    const name  = `${user.first_name} ${user.last_name}`;
    const token = jwt.sign({ id: user.id, name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, token);
    res.json({ success: true, user: { name, email: user.email, isAdmin: isAdminEmail(user.email) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Resend Verification ──────────────────────────────────────────────────────
app.post("/auth/resend-verification", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });
  if (!transporter)
    return res.status(503).json({ error: "Email verification is not configured" });

  try {
    const { rows } = await db.execute({
      sql:  "SELECT * FROM users WHERE email = ? AND verified = 0 AND deleted_at IS NULL",
      args: [email]
    });
    if (rows.length === 0)
      return res.status(400).json({ error: "Account not found or already verified" });

    const user    = rows[0];
    const code    = crypto.randomInt(100000, 999999).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);

    await db.execute({
      sql:  "UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?",
      args: [code, expires, user.id]
    });

    await sendVerificationEmail(email, user.first_name, code);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  try {
    const { rows } = await db.execute({
      sql:  "SELECT * FROM users WHERE email = ? AND deleted_at IS NULL",
      args: [email]
    });

    if (rows.length === 0)
      return res.status(400).json({ code: "EMAIL_NOT_FOUND", error: "No account found with this email" });

    const user  = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ code: "WRONG_PASSWORD", error: "Incorrect password" });

    if (!user.verified)
      return res.status(400).json({ code: "NOT_VERIFIED", error: "Please verify your email before signing in" });

    const name  = `${user.first_name} ${user.last_name}`;
    const token = jwt.sign({ id: user.id, name, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
    setAuthCookie(res, token);
    res.json({ success: true, user: { name, email: user.email, isAdmin: isAdminEmail(user.email) } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Logout / Me ──────────────────────────────────────────────────────────────
app.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

app.get("/auth/me", authRequired, (req, res) => {
  res.json({ user: { name: req.user.name, email: req.user.email, isAdmin: isAdminEmail(req.user.email) } });
});

// ─── Delete Account (soft delete) ────────────────────────────────────────────
app.delete("/auth/account", authRequired, async (req, res) => {
  try {
    // datetime('now') replaces MySQL's NOW()
    await db.execute({
      sql:  "UPDATE users SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    res.clearCookie("token");
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Orders ───────────────────────────────────────────────────────────────────
app.post("/orders", authRequired, async (req, res) => {
  try {
    const items = await buildOrderItems(req.body.items);
    if (!items || !items.length) return res.status(400).json({ error: "No valid items or insufficient stock" });

    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const result = await db.execute({
      sql:  "INSERT INTO orders (user_id, items, total) VALUES (?, ?, ?)",
      args: [req.user.id, JSON.stringify(items), total]
    });

    const stockUpdates = items
      .filter(item => item.coinId)
      .map(item => ({
        sql: "UPDATE coins SET qoh = qoh - ? WHERE id = ? AND qoh >= ?",
        args: [item.qty, item.coinId, item.qty]
      }));
    if (stockUpdates.length) await db.batch(stockUpdates, "write");

    // LibSQL returns lastInsertRowid as BigInt — convert to Number for JSON
    res.json({ success: true, orderId: Number(result.lastInsertRowid) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/orders", authRequired, async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql:  "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
      args: [req.user.id]
    });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Cart ─────────────────────────────────────────────────────────────────────
app.get("/cart", authRequired, async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql:  "SELECT items FROM carts WHERE user_id = ?",
      args: [req.user.id]
    });
    const cart = rows.length > 0 ? parseJSON(rows[0].items) : [];
    res.json({ cart });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/cart", authRequired, async (req, res) => {
  const { cart } = req.body;
  if (!Array.isArray(cart)) return res.status(400).json({ error: "Invalid cart" });
  try {
    // ON CONFLICT replaces MySQL's ON DUPLICATE KEY UPDATE
    await db.execute({
      sql:  "INSERT INTO carts (user_id, items) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, updated_at = datetime('now')",
      args: [req.user.id, JSON.stringify(cart)]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Profile ──────────────────────────────────────────────────────────────────
app.get("/profile", authRequired, async (req, res) => {
  try {
    const { rows } = await db.execute({
      sql:  "SELECT first_name, last_name, email, phone, addresses, saved_cards FROM users WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    if (!rows.length) return res.status(404).json({ error: "User not found" });
    const u = rows[0];
    res.json({
      first_name:  u.first_name,
      last_name:   u.last_name,
      email:       u.email,
      phone:       u.phone || "",
      addresses:   parseJSON(u.addresses),
      saved_cards: parseJSON(u.saved_cards)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/profile", authRequired, async (req, res) => {
  const { firstName, lastName, email, phone } = req.body;
  if (!firstName || !lastName || !email)
    return res.status(400).json({ error: "First name, last name and email are required" });

  try {
    const { rows: existing } = await db.execute({
      sql:  "SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL",
      args: [email, req.user.id]
    });
    if (existing.length)
      return res.status(400).json({ error: "Email already in use by another account" });

    await db.execute({
      sql:  "UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ? WHERE id = ?",
      args: [firstName, lastName, email, phone || null, req.user.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/profile/password", authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: "Both passwords required" });
  if (newPassword.length < 6)
    return res.status(400).json({ error: "New password must be at least 6 characters" });

  try {
    const { rows } = await db.execute({
      sql:  "SELECT password FROM users WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    if (!rows.length) return res.status(404).json({ error: "User not found" });

    const match = await bcrypt.compare(currentPassword, rows[0].password);
    if (!match) return res.status(400).json({ error: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 8);
    await db.execute({
      sql:  "UPDATE users SET password = ? WHERE id = ?",
      args: [hashed, req.user.id]
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/profile/address", authRequired, async (req, res) => {
  const { addr, index } = req.body;
  try {
    const { rows } = await db.execute({
      sql:  "SELECT addresses FROM users WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    let addresses = rows.length ? parseJSON(rows[0].addresses) : [];
    if (index !== null && index !== undefined && index >= 0) {
      addresses[index] = addr;
    } else {
      addresses.push(addr);
    }
    await db.execute({
      sql:  "UPDATE users SET addresses = ? WHERE id = ?",
      args: [JSON.stringify(addresses), req.user.id]
    });
    res.json({ success: true, addresses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/profile/address/:index", authRequired, async (req, res) => {
  const i = parseInt(req.params.index);
  try {
    const { rows } = await db.execute({
      sql:  "SELECT addresses FROM users WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    let addresses = rows.length ? parseJSON(rows[0].addresses) : [];
    addresses.splice(i, 1);
    await db.execute({
      sql:  "UPDATE users SET addresses = ? WHERE id = ?",
      args: [JSON.stringify(addresses), req.user.id]
    });
    res.json({ success: true, addresses });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/profile/card", authRequired, async (req, res) => {
  const { card } = req.body;
  if (
    !card ||
    typeof card !== "object" ||
    !/^\d{4}$/.test(String(card.last4 || "")) ||
    !/^\d{2}\/\d{2}$/.test(String(card.expiry || ""))
  ) {
    return res.status(400).json({ error: "Only card brand, last 4 digits, expiry, and name can be saved" });
  }

  const safeCard = {
    brand:  String(card.brand || "").slice(0, 40),
    last4:  String(card.last4),
    expiry: String(card.expiry),
    name:   String(card.name || "").slice(0, 80)
  };

  try {
    const { rows } = await db.execute({
      sql:  "SELECT saved_cards FROM users WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    let saved_cards = rows.length ? parseJSON(rows[0].saved_cards) : [];
    saved_cards.push(safeCard);
    await db.execute({
      sql:  "UPDATE users SET saved_cards = ? WHERE id = ?",
      args: [JSON.stringify(saved_cards), req.user.id]
    });
    res.json({ success: true, saved_cards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/profile/card/:index", authRequired, async (req, res) => {
  const i = parseInt(req.params.index);
  try {
    const { rows } = await db.execute({
      sql:  "SELECT saved_cards FROM users WHERE id = ? AND deleted_at IS NULL",
      args: [req.user.id]
    });
    let saved_cards = rows.length ? parseJSON(rows[0].saved_cards) : [];
    saved_cards.splice(i, 1);
    await db.execute({
      sql:  "UPDATE users SET saved_cards = ? WHERE id = ?",
      args: [JSON.stringify(saved_cards), req.user.id]
    });
    res.json({ success: true, saved_cards });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── NY Close Helpers ─────────────────────────────────────────────────────────
function isNYCloseWindow() {
  const now        = new Date();
  const estOffset  = -5 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const estMinutes = ((utcMinutes + estOffset) % (24 * 60) + 24 * 60) % (24 * 60);
  const estHour    = Math.floor(estMinutes / 60);
  const estMin     = estMinutes % 60;
  const estDay     = new Date(now.getTime() + estOffset * 60000).getUTCDay();
  return estDay >= 1 && estDay <= 5 && estHour === 17 && estMin < 10;
}

function getLastCloseDate() {
  const now       = new Date();
  const estOffset = -5 * 60;
  const estTime   = new Date(now.getTime() + estOffset * 60000);
  let d           = new Date(estTime);
  if (estTime.getUTCHours() < 17) d.setUTCDate(d.getUTCDate() - 1);
  const dow = d.getUTCDay();
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Price History Worker ─────────────────────────────────────────────────────
async function recordPrices() {
  try {
    const metals  = ["XAU", "XAG", "XPT", "XPD"];
    const results = {};
    for (const metal of metals) {
      const response = await fetch(`https://api.gold-api.com/price/${metal}`);
      const data     = await response.json();
      results[metal] = data.price;
    }

    const inCloseWindow = isNYCloseWindow();
    const closeDate     = getLastCloseDate();

    // Build batch of write statements — replaces pool.getConnection() pattern
    const statements = [];

    for (const [metal, price] of Object.entries(results)) {
      if (price == null) continue;

      statements.push({
        sql:  "INSERT INTO price_history (metal_type, price) VALUES (?, ?)",
        args: [metal, price]
      });

      if (inCloseWindow) {
        // ON CONFLICT replaces MySQL's ON DUPLICATE KEY UPDATE
        statements.push({
          sql:  `INSERT INTO ny_close (metal_type, price, close_date)
                 VALUES (?, ?, ?)
                 ON CONFLICT(metal_type, close_date) DO UPDATE SET price = excluded.price`,
          args: [metal, price, closeDate]
        });
      }
    }

    // datetime('now', '-24 hours') replaces MySQL's DATE_SUB(NOW(), INTERVAL 24 HOUR)
    statements.push({
      sql:  "DELETE FROM price_history WHERE timestamp < datetime('now', '-24 hours')",
      args: []
    });

    await db.batch(statements, "write");

    cache.data      = results;
    cache.timestamp = Date.now();
    console.log(`[${new Date().toISOString()}] Price history recorded${inCloseWindow ? " [NY CLOSE CAPTURED]" : ""}`);
  } catch (err) {
    console.error("Price history worker error:", err.message);
  }
}

function startPriceHistoryWorker() {
  recordPrices();
  setInterval(recordPrices, 5 * 60 * 1000);
  console.log("Price history worker started (runs every 5 minutes)");
}

// ─── Prices ───────────────────────────────────────────────────────────────────
let cache = { data: null, timestamp: 0 };

app.get("/prices", async (req, res) => {
  const now = Date.now();
  try {
    if (!cache.data || now - cache.timestamp >= 60000) {
      const metals  = ["XAU", "XAG", "XPT", "XPD"];
      const results = {};
      for (const metal of metals) {
        const response = await fetch(`https://api.gold-api.com/price/${metal}`);
        const data     = await response.json();
        results[metal] = data.price;
      }
      cache.data      = results;
      cache.timestamp = now;
    }

    const { rows: historyRows } = await db.execute({
      sql:  `SELECT metal_type, price, timestamp
             FROM price_history
             WHERE timestamp >= datetime('now', '-24 hours')
             ORDER BY timestamp ASC`,
      args: []
    });

    const history = { XAU: [], XAG: [], XPT: [], XPD: [] };
    for (const row of historyRows) {
      if (history[row.metal_type] !== undefined)
        history[row.metal_type].push(parseFloat(row.price));
    }
    for (const metal of Object.keys(history)) {
      if (history[metal].length > 30) history[metal] = history[metal].slice(-30);
    }

    const closeDate = getLastCloseDate();
    const { rows: closeRows } = await db.execute({
      sql:  "SELECT metal_type, price FROM ny_close WHERE close_date = ?",
      args: [closeDate]
    });
    const nyClose = { XAU: null, XAG: null, XPT: null, XPD: null };
    for (const row of closeRows) {
      nyClose[row.metal_type] = parseFloat(row.price);
    }

    res.json({ ...cache.data, history, nyClose });
  } catch (error) {
    console.error("Error fetching prices:", error);
    res.json({
      XAU: cache.data?.XAU ?? null,
      XAG: cache.data?.XAG ?? null,
      XPT: cache.data?.XPT ?? null,
      XPD: cache.data?.XPD ?? null,
      history: { XAU: [], XAG: [], XPT: [], XPD: [] },
      nyClose: { XAU: null, XAG: null, XPT: null, XPD: null }
    });
  }
});

// Pass the Turso db client to the coins router (instead of the old mysql2 pool)
app.use("/api/coins", coinsRouter(db, { adminRequired }));

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
