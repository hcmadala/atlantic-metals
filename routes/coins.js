const express = require("express");
const multer  = require("multer");
const router  = express.Router();
const { uploadToCloudinary, getImageUrl, getSrcSet, getPlaceholderUrl } = require("../utils/cloudinary");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image uploads are allowed"));
    cb(null, true);
  }
});

// Attach all image URLs to a coin row
function attachImageUrls(coin) {
  const attach = (key) => {
    if (!key) return null;
    return {
      thumb_url:       getImageUrl(key, 120),
      card_url:        getImageUrl(key, 400),
      detail_url:      getImageUrl(key, 1200),
      srcset:          getSrcSet(key, [400, 800, 1200]),
      placeholder_url: getPlaceholderUrl(key)
    };
  };

  return {
    ...coin,
    image1: attach(coin.image_key),
    image2: attach(coin.image_key_2),
    // keep these for backward compatibility so existing frontend doesn't break
    thumb_url:       attach(coin.image_key)?.thumb_url       || null,
    card_url:        attach(coin.image_key)?.card_url        || null,
    detail_url:      attach(coin.image_key)?.detail_url      || null,
    srcset:          attach(coin.image_key)?.srcset          || null,
    placeholder_url: attach(coin.image_key)?.placeholder_url || null,
  };
}

function parseQoh(value) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function normalizeType(value) {
  return ["coins", "bars", "rounds"].includes(value) ? value : "coins";
}

module.exports = (db, { adminRequired }) => {
  router.post("/:id/image/1", adminRequired, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Image file required" });
      const result = await uploadToCloudinary(req.file.buffer, "coins");
      await db.execute({ sql: "UPDATE coins SET image_key = ? WHERE id = ?", args: [result.public_id, req.params.id] });
      res.json({ success: true, image1: attachImageUrls({ image_key: result.public_id }).image1 });
    } catch (err) { console.error(err); res.status(500).json({ error: "Upload failed" }); }
  });
  
  router.post("/:id/image/2", adminRequired, upload.single("image"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Image file required" });
      const result = await uploadToCloudinary(req.file.buffer, "coins");
      await db.execute({ sql: "UPDATE coins SET image_key_2 = ? WHERE id = ?", args: [result.public_id, req.params.id] });
      res.json({ success: true, image2: attachImageUrls({ image_key_2: result.public_id }).image2 });
    } catch (err) { console.error(err); res.status(500).json({ error: "Upload failed" }); }
  });

  router.get("/", async (req, res) => {
    try {
      const { rows } = await db.execute({ sql: "SELECT * FROM coins ORDER BY created_at DESC", args: [] });
      res.json(rows.map(attachImageUrls));
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  router.get("/:id", async (req, res) => {
    try {
      const { rows } = await db.execute({ sql: "SELECT * FROM coins WHERE id = ?", args: [req.params.id] });
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(attachImageUrls(rows[0]));
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });


  router.post("/", adminRequired, async (req, res) => {
    const { name, metal, mint, weight_oz, purity, year } = req.body;
    const sku = slugify(req.body.sku || name);
    const productType = normalizeType(req.body.product_type);
    const qoh = parseQoh(req.body.qoh);
    if (!name || !metal || !sku) return res.status(400).json({ error: "Name, SKU and metal required" });
    if (!["gold", "silver", "platinum", "palladium"].includes(metal)) {
      return res.status(400).json({ error: "Invalid metal" });
    }
    try {
      const slug = slugify(name);
      const result = await db.execute({
        sql:  "INSERT INTO coins (sku, name, slug, metal, product_type, mint, weight_oz, purity, year, qoh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [sku, name, slug, metal, productType, mint || null, weight_oz || null, purity || null, year || null, qoh]
      });
      res.json({ success: true, id: Number(result.lastInsertRowid) });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  router.put("/:id", adminRequired, async (req, res) => {
    const { name, metal, mint, weight_oz, purity, year } = req.body;
    const sku = slugify(req.body.sku || name);
    const productType = normalizeType(req.body.product_type);
    const qoh = parseQoh(req.body.qoh);
    if (!name || !metal || !sku) return res.status(400).json({ error: "Name, SKU and metal required" });
    if (!["gold", "silver", "platinum", "palladium"].includes(metal)) {
      return res.status(400).json({ error: "Invalid metal" });
    }

    try {
      await db.execute({
        sql: `UPDATE coins
              SET sku = ?, name = ?, slug = ?, metal = ?, product_type = ?,
                  mint = ?, weight_oz = ?, purity = ?, year = ?, qoh = ?
              WHERE id = ?`,
        args: [sku, name, slugify(name), metal, productType, mint || null, weight_oz || null, purity || null, year || null, qoh, req.params.id]
      });
      res.json({ success: true });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  router.put("/:id/stock", adminRequired, async (req, res) => {
    const qoh = parseQoh(req.body.qoh);
    try {
      await db.execute({ sql: "UPDATE coins SET qoh = ? WHERE id = ?", args: [qoh, req.params.id] });
      res.json({ success: true, qoh });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  router.delete("/:id", adminRequired, async (req, res) => {
    try {
      await db.execute({ sql: "DELETE FROM coins WHERE id = ?", args: [req.params.id] });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
};
