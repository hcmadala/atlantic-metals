const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Upload a file buffer to Cloudinary.
 * Stores the original — Cloudinary generates resized versions on-the-fly via URL.
 */
function uploadToCloudinary(fileBuffer, folder = "coins") {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        // Store original quality — resizing/format conversion happens at URL level
        quality:       "auto",
        fetch_format:  "auto"
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
}

/**
 * Generate a single sized URL from a public_id.
 *
 * crop: "fit" keeps the full coin visible (no cropping).
 * crop: "fill" was the old setting — it cropped to fill the box, which cuts coins.
 *
 * Sizes:
 *   120  → thumbnail (grid list)
 *   400  → card (product card)
 *   800  → medium (modal / quick view)
 *   1200 → full detail page
 */
function getImageUrl(publicId, width = 400) {
  return cloudinary.url(publicId, {
    width,
    crop:         "fit",   // show full coin, no cropping
    quality:      "auto",  // Cloudinary picks optimal quality
    fetch_format: "auto",  // serves WebP/AVIF to browsers that support it
    secure:       true
  });
}

/**
 * Generate a srcset string for responsive <img> tags.
 * Usage in HTML:  <img src="..." srcset="...getSrcSet(id)..." sizes="...">
 *
 * Example output:
 *   "https://res.cloudinary.com/.../w_400/coin.webp 400w,
 *    https://res.cloudinary.com/.../w_800/coin.webp 800w,
 *    https://res.cloudinary.com/.../w_1200/coin.webp 1200w"
 */
function getSrcSet(publicId, widths = [400, 800, 1200]) {
  return widths
    .map(w => `${getImageUrl(publicId, w)} ${w}w`)
    .join(", ");
}

/**
 * Generate a tiny blurred placeholder URL (30px wide).
 * Use as the initial src before the real image loads — gives a blur-up effect.
 *
 * Example:
 *   const placeholder = getPlaceholderUrl(coin.image_key);
 *   <img src="${placeholder}" data-src="${card_url}" class="lazy" ...>
 */
function getPlaceholderUrl(publicId) {
  return cloudinary.url(publicId, {
    width:        30,
    crop:         "fit",
    quality:      1,       // very low quality = tiny file (~1-2KB)
    fetch_format: "auto",
    effect:       "blur:400",
    secure:       true
  });
}

module.exports = { uploadToCloudinary, getImageUrl, getSrcSet, getPlaceholderUrl };
