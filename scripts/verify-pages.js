const fs   = require("fs");
const path = require("path");
const { renderPage } = require("../lib/page-renderer");

const ROOT = path.join(__dirname, "..");

const layoutPages = [
  "index.html",
  "products.html",
  "product.html",
  "login.html",
  "profile.html",
  "coins.html",
  "types.html"
];

const requiredMarkup = ["cartDrawer", "gold-price", "site-footer", "metal-menu"];

function collectLocalAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const asset = match[1];
    if (/^(https?:|\/\/|#|data:)/.test(asset)) continue;
    assets.add(asset.split("?")[0]);
  }
  return [...assets];
}

for (const page of layoutPages) {
  const html = renderPage(page);
  if (!html) throw new Error(`Failed to render ${page}`);

  for (const token of requiredMarkup) {
    if (!html.includes(token)) {
      throw new Error(`${page} missing expected markup: ${token}`);
    }
  }

  for (const asset of collectLocalAssets(html)) {
    const filePath = path.join(ROOT, asset);
    if (!fs.existsSync(filePath)) {
      throw new Error(`${page} references missing asset: ${asset}`);
    }
  }
}

console.log(`page render ok (${layoutPages.length} pages)`);
