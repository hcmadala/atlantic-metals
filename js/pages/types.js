const params = new URLSearchParams(window.location.search);
const metal = params.get("metal");

const metalTitle = document.getElementById("metalTitle");
if (metalTitle) {
    metalTitle.textContent = metal
        ? `${metal.charAt(0).toUpperCase()}${metal.slice(1)}`
        : "Products";
}

const barsLink = document.getElementById("bars");
const coinsLink = document.getElementById("coins");
const roundsLink = document.getElementById("rounds");
const metalQuery = metal ? `metal=${encodeURIComponent(metal)}` : "";

if (barsLink) barsLink.href = metalQuery ? `products.html?${metalQuery}&type=bars` : "products.html?type=bars";
if (coinsLink) coinsLink.href = metalQuery ? `products.html?${metalQuery}&type=coins` : "products.html?type=coins";
if (roundsLink) roundsLink.href = metalQuery ? `products.html?${metalQuery}&type=rounds` : "products.html?type=rounds";
