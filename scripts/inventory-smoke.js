const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/data.js", "utf8");
const context = {};
vm.createContext(context);
const products = vm.runInContext(`${source}; products;`, context);

assert(Array.isArray(products), "products must be an array");
assert(products.length > 0, "products must not be empty");

const skus = new Set();
for (const product of products) {
  assert(product.id, "product id is required");
  assert(product.sku, `product ${product.id} is missing sku`);
  assert(!skus.has(product.sku), `duplicate sku: ${product.sku}`);
  skus.add(product.sku);
  assert(product.name, `product ${product.sku} is missing name`);
  assert(["gold", "silver", "platinum", "palladium"].includes(product.metal), `invalid metal for ${product.sku}`);
  assert(["coins", "bars", "rounds"].includes(product.type), `invalid type for ${product.sku}`);
}

console.log(`inventory smoke ok (${products.length} products, ${skus.size} skus)`);
