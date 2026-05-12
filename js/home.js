const grid = document.getElementById("featuredGrid");

async function initHomeProducts() {
    if (typeof hydrateProductImages === "function") {
        await hydrateProductImages(products);
    }

    const featured = products.filter(p => p.available).slice(0, 8);

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
                    <img src="${p.image}" alt="${p.name}" ${p.srcset ? `srcset="${p.srcset}" sizes="(max-width: 700px) 90vw, 260px"` : ""}>
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

    updateCartCount();
}

function changeQty(btn, delta) {
    const qtyEl = btn.parentElement.querySelector(".qty-value");
    let qty = parseInt(qtyEl.innerText);

    const card = btn.closest(".featured-card");
    const addBtn = card?.querySelector(".add-to-cart-btn");
    const idMatch = addBtn?.getAttribute("onclick")?.match(/\d+/);
    const product = idMatch ? products.find(p => p.id === parseInt(idMatch[0])) : null;
    const maxQty = product?.qoh !== undefined ? Math.max(0, Number(product.qoh || 0)) : Infinity;

    qty = Math.max(1, Math.min(maxQty || 1, qty + delta));
    qtyEl.innerText = qty;
}

async function addToCartHome(productId, btn) {
    const product = products.find(p => p.id === productId);
    const maxQty = product?.qoh !== undefined ? Math.max(0, Number(product.qoh || 0)) : Infinity;
    if (maxQty <= 0) return;

    const requestedQty = parseInt(btn.parentElement.querySelector(".qty-value").innerText);
    const cart     = JSON.parse(localStorage.getItem("cart") || "[]");
    const existing = cart.find(i => i.id === productId);
    const currentQty = existing ? existing.qty : 0;
    const qty = Math.min(requestedQty, Math.max(0, maxQty - currentQty));

    if (qty <= 0) {
        btn.innerText = `Max ${maxQty} in stock`;
        setTimeout(() => btn.innerText = "Add to Cart", 1500);
        return;
    }

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

initHomeProducts();
