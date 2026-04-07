const featured = products.filter(p => p.available).slice(0, 8);
const grid = document.getElementById("featuredGrid");

featured.forEach(p => {
    const card = document.createElement("div");
    card.className = "featured-card";

    // Use dynamic lowest price instead of static p.price
    const lowestPrice = typeof getLowestPrice === "function"
        ? getLowestPrice(p.metal, p.type)
        : p.price;

    card.innerHTML = `
        <a href="product.html?id=${p.id}" class="featured-card-link">
            <div class="featured-img-wrap">
                <img src="${p.image}" alt="${p.name}">
            </div>
            <h3>${p.name}</h3>
            <p class="featured-price">As Low As $${lowestPrice.toFixed(2)}</p>
        </a>
        <div class="card-bottom">
            <div class="card-qty">
                <button class="qty-btn" onclick="changeQty(this,-1)">−</button>
                <span class="qty-value">1</span>
                <button class="qty-btn" onclick="changeQty(this,1)">+</button>
            </div>
            <button class="add-to-cart-btn" onclick="addToCartHome(${p.id}, this)">Add to Cart</button>
        </div>
    `;
    grid.appendChild(card);
});

function changeQty(btn, delta) {
    const qtyEl = btn.parentElement.querySelector(".qty-value");
    let qty = parseInt(qtyEl.innerText);
    qty = Math.max(1, qty + delta);
    qtyEl.innerText = qty;
}

async function addToCartHome(productId, btn) {
    const qty      = parseInt(btn.parentElement.querySelector(".qty-value").innerText);
    const cart     = JSON.parse(localStorage.getItem("cart") || "[]");
    const existing = cart.find(i => i.id === productId);

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ id: productId, qty: qty });
    }

    // saveCart saves to localStorage AND server if logged in
    await saveCart(cart);
    updateCartCount();

    btn.innerText = "Added!";
    setTimeout(() => btn.innerText = "Add to Cart", 1500);
    if (typeof renderCartDrawer === "function") renderCartDrawer();
}

function updateCartCount() {
    const cart  = JSON.parse(localStorage.getItem("cart") || "[]");
    const total = cart.reduce((sum, i) => sum + i.qty, 0);
    const el    = document.getElementById("cartCount");
    if (el) el.innerText = total;
}

updateCartCount();