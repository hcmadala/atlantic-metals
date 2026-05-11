const express = require("express");
const multer  = require("multer");
const router  = express.Router();
const { uploadToCloudinary, getImageUrl, getSrcSet, getPlaceholderUrl } = require("../utils/cloudinary");

const upload = multer({ storage: multer.memoryStorage() });

const jwt        = require("jsonwebtoken");
const JWT_SECRET = "atlanticmetals_secret_2026";

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

// Attach all image URLs to a coin row
function attachImageUrls(coin) {
  if (!coin.image_key) {
    return { ...coin, thumb_url: null, card_url: null, detail_url: null, srcset: null, placeholder_url: null };
  }
  return {
    ...coin,
    thumb_url:       getImageUrl(coin.image_key, 120),
    card_url:        getImageUrl(coin.image_key, 400),
    detail_url:      getImageUrl(coin.image_key, 1200),
    srcset:          getSrcSet(coin.image_key, [400, 800, 1200]),
    placeholder_url: getPlaceholderUrl(coin.image_key)
  };
}

module.exports = (db) => {

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

  router.post("/:id/image", authRequired, upload.single("image"), async (req, res) => {
    try {
      const result = await uploadToCloudinary(req.file.buffer, "coins");
      await db.execute({ sql: "UPDATE coins SET image_key = ? WHERE id = ?", args: [result.public_id, req.params.id] });
      res.json({
        success:         true,
        public_id:       result.public_id,
        thumb_url:       getImageUrl(result.public_id, 120),
        card_url:        getImageUrl(result.public_id, 400),
        detail_url:      getImageUrl(result.public_id, 1200),
        srcset:          getSrcSet(result.public_id, [400, 800, 1200]),
        placeholder_url: getPlaceholderUrl(result.public_id)
      });
    } catch (err) { console.error(err); res.status(500).json({ error: "Upload failed" }); }
  });

  router.post("/", async (req, res) => {
    const { name, metal, mint, weight_oz, purity, year } = req.body;
    if (!name || !metal) return res.status(400).json({ error: "Name and metal required" });
    try {
      const slug   = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const result = await db.execute({
        sql:  "INSERT INTO coins (name, slug, metal, mint, weight_oz, purity, year) VALUES (?, ?, ?, ?, ?, ?, ?)",
        args: [name, slug, metal, mint || null, weight_oz || null, purity || null, year || null]
      });
      res.json({ success: true, id: Number(result.lastInsertRowid) });
    } catch (err) { console.error(err); res.status(500).json({ error: "Server error" }); }
  });

  return router;
};
