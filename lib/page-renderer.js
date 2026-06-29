const fs   = require("fs");
const path = require("path");

const ROOT         = path.join(__dirname, "..");
const PARTIALS_DIR = path.join(ROOT, "partials");
const PARTIAL_RE   = /<!--\s*@partial:([\w-]+)\s*-->/g;

const partialHtml = new Map();
const pageHtml    = new Map();
const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

function readPartialFile(name) {
  const filePath = path.join(PARTIALS_DIR, `${name}.html`);
  return fs.readFileSync(filePath, "utf8");
}

function getPartial(name) {
  if (!partialHtml.has(name)) {
    partialHtml.set(name, readPartialFile(name));
  }
  return partialHtml.get(name);
}

function resolvePartial(name) {
  if (name === "header") {
    return (
      `<div class="sticky-wrapper">${getPartial("ticker")}${getPartial("navbar")}${getPartial("metal-menu")}</div>`
    );
  }
  return getPartial(name);
}

function renderPage(relativePath) {
  const pagePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(pagePath)) return null;

  let html = fs.readFileSync(pagePath, "utf8");
  html = html.replace(PARTIAL_RE, (_, name) => resolvePartial(name));
  return html;
}

function getRenderedPage(relativePath) {
  if (!isProd) return renderPage(relativePath);

  if (!pageHtml.has(relativePath)) {
    pageHtml.set(relativePath, renderPage(relativePath));
  }
  return pageHtml.get(relativePath);
}

function clearPageCache() {
  pageHtml.clear();
  partialHtml.clear();
}

function createPageMiddleware() {
  return function serveRenderedPage(req, res, next) {
    let relativePath = req.path === "/" ? "index.html" : req.path.replace(/^\//, "");

    if (!relativePath.endsWith(".html")) return next();

    const html = getRenderedPage(relativePath);
    if (!html) return next();

    res.type("html").send(html);
  };
}

module.exports = {
  renderPage,
  getRenderedPage,
  createPageMiddleware,
  clearPageCache
};
