// ─── Cart sync helpers ────────────────────────────────────────────────────────

let isSyncing = false;

async function isLoggedIn() {
    try {
        const res = await fetch("/auth/me");
        return res.ok;
    } catch { return false; }
}

// Save cart to both localStorage and server (if logged in)
async function saveCart(cart) {
    localStorage.setItem("cart", JSON.stringify(cart));
    try {
        const res = await fetch("/auth/me");
        if (!res.ok) return;
        await fetch("/cart", {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ cart })
        });
    } catch (e) { console.warn("Cart sync failed", e); }
}

// On page load: server is source of truth when logged in.
// Only merge local items that don't exist on the server yet (added while logged out).
async function syncCartOnLoad() {
    if (isSyncing) return;
    isSyncing = true;
    try {
        const authRes = await fetch("/auth/me");
        if (!authRes.ok) return; // not logged in — use localStorage as-is

        const cartRes = await fetch("/cart");
        if (!cartRes.ok) return;

        const data       = await cartRes.json();
        const raw        = data.cart || [];
        const serverCart = typeof raw === "string" ? JSON.parse(raw) : raw;
        const localCart  = JSON.parse(localStorage.getItem("cart") || "[]");

        // Server is source of truth — start from it
        const merged = [...serverCart];

        // Only add local items that are NOT already on the server
        const newLocalItems = localCart.filter(li => !serverCart.find(si => si.id === li.id));
        merged.push(...newLocalItems);

        localStorage.setItem("cart", JSON.stringify(merged));

        // Push to server only if we added new local-only items
        if (newLocalItems.length > 0) {
            await fetch("/cart", {
                method:  "PUT",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ cart: merged })
            });
        }

        updateCartCount();
        if (document.getElementById("cartDrawer")?.classList.contains("open")) {
            renderCartDrawer();
        }
    } catch (e) {
        console.warn("Cart load failed", e);
    } finally {
        isSyncing = false;
    }
}

// ─── Cart UI ──────────────────────────────────────────────────────────────────

function openCart() {
    document.getElementById("cartDrawer").classList.add("open");
    document.getElementById("cartOverlay").classList.add("open");
    renderCartDrawer();
}

function closeCart() {
    document.getElementById("cartDrawer").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
}

function renderCartDrawer() {
    const cart    = JSON.parse(localStorage.getItem("cart") || "[]");
    const itemsEl = document.getElementById("cartDrawerItems");
    const totalEl = document.getElementById("cartTotal");

    if (!itemsEl) return;

    if (cart.length === 0) {
        itemsEl.innerHTML = `<p class="cart-empty">Your cart is empty.</p>`;
        if (totalEl) totalEl.innerText = "$0.00";
        updateCartCount();
        return;
    }

    let total = 0;

    itemsEl.innerHTML = cart.map((item, cartIndex) => {
        const p = products.find(prod => prod.id === item.id);
        if (!p) return "";

        // Use dynamic wire price based on quantity
        const unitPrice = typeof calcWirePrice === "function"
            ? calcWirePrice(p.metal, p.type, item.qty)
            : p.price;
        const subtotal = unitPrice * item.qty;
        total += subtotal;

        return `
            <div class="cart-item">
                <img src="${p.image}" alt="${p.name}" class="cart-item-img">
                <div class="cart-item-info">
                    <p class="cart-item-name">${p.name}</p>
                    <p class="cart-item-price">$${unitPrice.toFixed(2)} / oz</p>
                    <p class="cart-item-subtotal">$${subtotal.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})} CAD</p>
                    <div class="cart-item-controls">
                        <div class="card-qty">
                            <button class="qty-btn" onclick="cartChangeQty(${cartIndex}, -1)">−</button>
                            <span class="qty-value">${item.qty}</span>
                            <button class="qty-btn" onclick="cartChangeQty(${cartIndex}, 1)">+</button>
                        </div>
                        <button class="cart-remove-btn" onclick="cartRemove(${cartIndex})">Remove</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    if (totalEl) totalEl.innerText = "$" + total.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2}) + " CAD";
    updateCartCount();
}

async function cartChangeQty(cartIndex, delta) {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    cart[cartIndex].qty = Math.max(1, cart[cartIndex].qty + delta);
    await saveCart(cart);
    renderCartDrawer();
}

async function cartRemove(cartIndex) {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    cart.splice(cartIndex, 1);
    await saveCart(cart);
    renderCartDrawer();
}

function updateCartCount() {
    const cart  = JSON.parse(localStorage.getItem("cart") || "[]");
    const total = cart.reduce((sum, i) => sum + i.qty, 0);
    const el    = document.getElementById("cartCount");
    if (el) el.innerText = total;
}

async function handleCheckout() {
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    if (!cart.length) return;

    const authRes = await fetch("/auth/me");
    if (!authRes.ok) {
        window.location.href = "login.html";
        return;
    }

    const items = cart.map(item => {
        const p = products.find(prod => prod.id === item.id);
        if (!p) return null;
        const unitPrice = typeof calcWirePrice === "function"
            ? calcWirePrice(p.metal, p.type, item.qty)
            : p.price;
        return {
            productId: p.id,
            name:      p.name,
            metal:     p.metal,
            type:      p.type,
            qty:       item.qty,
            price:     unitPrice
        };
    }).filter(Boolean);

    const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);

    const res = await fetch("/orders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ items, total })
    });

    if (res.ok) {
        localStorage.removeItem("cart");
        await fetch("/cart", {
            method:  "PUT",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ cart: [] })
        });
        updateCartCount();
        alert("Order placed successfully!");
        window.location.reload();
    } else {
        alert("Error placing order. Please try again.");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const cartBtn      = document.getElementById("cartBtn");
    const cartCloseBtn = document.getElementById("cartCloseBtn");
    const cartOverlay  = document.getElementById("cartOverlay");
    const checkoutBtn  = document.querySelector(".checkout-btn");

    if (cartBtn)      cartBtn.addEventListener("click", openCart);
    if (cartCloseBtn) cartCloseBtn.addEventListener("click", closeCart);
    if (cartOverlay)  cartOverlay.addEventListener("click", closeCart);
    if (checkoutBtn)  checkoutBtn.addEventListener("click", handleCheckout);

    syncCartOnLoad();
});