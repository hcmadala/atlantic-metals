const params = new URLSearchParams(window.location.search);
const id = parseInt(params.get("id"));
const p  = products.find(prod => prod.id === id);

let currentImageIndex = 0;
let images = [];
let thumbOffset = 0;
const THUMB_STEP = 110; // thumb height (100) + gap (10)

if (!p) {
    document.getElementById("productName").innerText = "Product not found";
} else {
    document.title = p.name + " – Atlantic Metals";

    // ── IMAGES ──────────────────────────────────────────────────────────
    if (p.image)  images.push(p.image);
    if (p.image2) images.push(p.image2);

    const thumbsTrack = document.getElementById("thumbsTrack");
    images.forEach((img, i) => {
        const el = document.createElement("img");
        el.src       = img;
        el.alt       = p.name;
        el.className = "thumb-img" + (i === 0 ? " active-thumb" : "");
        el.onclick   = () => selectImage(i);
        thumbsTrack.appendChild(el);
    });

    document.getElementById("mainImage").src = images[0] || "";

    // ── TEXT ─────────────────────────────────────────────────────────────
    document.getElementById("productName").innerText = p.name;

    const availability = document.getElementById("availability");
    availability.className = p.available ? "in-stock" : "out-stock";
    availability.innerText = p.available ? "✔ In Stock" : "✖ Out of Stock";

    // Specs
    const specMetal  = document.getElementById("specMetal");
    const specType   = document.getElementById("specType");
    const specWeight = document.getElementById("specWeight");
    if (specMetal)  specMetal.innerText  = p.metal.charAt(0).toUpperCase() + p.metal.slice(1);
    if (specType)   specType.innerText   = p.type.charAt(0).toUpperCase()  + p.type.slice(1);
    if (specWeight) specWeight.innerText = p.weight + " oz";

    // Disable Add to Cart if out of stock
    const cartBtn = document.getElementById("detailCartBtn");
    if (!p.available) {
        cartBtn.disabled  = true;
        cartBtn.innerText = "Out of Stock";
    }

    // Breadcrumb
    const bc = document.getElementById("breadcrumb");
    if (bc) {
        bc.innerHTML = `
            <a href="index.html">Home</a>
            <span>›</span>
            <a href="products.html">All</a>
            <span>›</span>
            <a href="products.html?metal=${p.metal}">${p.metal.charAt(0).toUpperCase() + p.metal.slice(1)}</a>
            <span>›</span>
            <span>${p.name}</span>
        `;
    }

    buildPricingTable();
    updateDetailPrice();
}

// ── PRICE — uses live spot via calcWirePrice ──────────────────────────────
function updateDetailPrice() {
    const qty  = parseInt(document.getElementById("detailQty").innerText);
    const wire = calcWirePrice(p.metal, p.type, qty);
    document.getElementById("detailPrice").innerText =
        "$" + wire.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " CAD";
}

// ── PRICING TABLE ─────────────────────────────────────────────────────────
function buildPricingTable() {
    const tiers = getPricingTiers(p.metal, p.type);
    const qty   = parseInt(document.getElementById("detailQty").innerText);

    document.getElementById("pricingTable").innerHTML = `
        <table class="pricing-table">
            <thead>
                <tr>
                    <th>Qty</th>
                    <th>Wire / e-Transfer</th>
                    <th>Credit / PayPal</th>
                </tr>
            </thead>
            <tbody>
                ${tiers.map(t => {
                    const parts  = t.label.includes("+")
                        ? [parseInt(t.label), Infinity]
                        : t.label.split(" - ").map(Number);
                    const active = qty >= parts[0] && qty <= parts[1];
                    return `
                        <tr class="${active ? "active-tier" : ""}">
                            <td>${t.label}</td>
                            <td>$${t.wire.toFixed(2)}</td>
                            <td>$${t.credit.toFixed(2)}</td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;
}

// ── IMAGE SELECTION ───────────────────────────────────────────────────────
function selectImage(index) {
    currentImageIndex = index;
    const mainImg = document.getElementById("mainImage");
    mainImg.style.opacity = "0";
    setTimeout(() => {
        mainImg.src           = images[index];
        mainImg.style.opacity = "1";
    }, 100);
    document.querySelectorAll(".thumb-img").forEach((img, i) => {
        img.classList.toggle("active-thumb", i === index);
    });
}

// ── SCROLL THUMBNAILS ─────────────────────────────────────────────────────
function scrollThumbs(direction) {
    const track     = document.getElementById("thumbsTrack");
    const maxOffset = Math.max(0, images.length - 2);
    thumbOffset     = Math.max(0, Math.min(maxOffset, thumbOffset + direction));
    track.style.transform = `translateY(-${thumbOffset * THUMB_STEP}px)`;
}

// ── QTY CHANGE ────────────────────────────────────────────────────────────
function changeDetailQty(delta) {
    const el = document.getElementById("detailQty");
    let qty  = parseInt(el.innerText);
    qty      = Math.max(1, qty + delta);
    el.innerText = qty;
    updateDetailPrice();
    buildPricingTable();
}

// ── ADD TO CART — saves to server if logged in ────────────────────────────
async function addToCartDetail() {
    if (!p.available) return;

    const qty      = parseInt(document.getElementById("detailQty").innerText);
    const cart     = JSON.parse(localStorage.getItem("cart") || "[]");
    const existing = cart.find(i => i.id === id);

    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ id: id, qty: qty });
    }

    await saveCart(cart);
    updateCartCount();

    const btn     = document.getElementById("detailCartBtn");
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