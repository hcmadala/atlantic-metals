const params = new URLSearchParams(window.location.search);
const metal = params.get("metal");

const metalTitle = document.getElementById("metalTitle");
if (metalTitle) metalTitle.innerText = metal.toUpperCase() + " Products";

const barsLink = document.getElementById("bars");
const coinsLink = document.getElementById("coins");
const roundsLink = document.getElementById("rounds");

if (barsLink) barsLink.href = `products.html?metal=${metal}&type=bars`;
if (coinsLink) coinsLink.href = `products.html?metal=${metal}&type=coins`;
if (roundsLink) roundsLink.href = `products.html?metal=${metal}&type=rounds`;