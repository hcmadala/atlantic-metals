const params = new URLSearchParams(window.location.search);
const id = parseInt(params.get("id"));
const p = products[id];

const detail = document.getElementById("productDetail");

let currentImageIndex = 0;
const images = [];

if(!p){
    detail.innerHTML = "<p>Product not found.</p>";
} else {
    document.title = p.name;

    if(p.image) images.push(p.image);
    if(p.image2) images.push(p.image2);

    detail.innerHTML = `
        <div class="breadcrumb">
            <a href="index.html">Home</a>
            <span>›</span>
            <a href="products.html">All</a>
            <span>›</span>
            <a href="products.html?metal=${p.metal}">${p.metal.charAt(0).toUpperCase() + p.metal.slice(1)}</a>
            <span>›</span>
            <a href="products.html?metal=${p.metal}&type=${p.type}">${p.type.charAt(0).toUpperCase() + p.type.slice(1)}</a>
            <span>›</span>
            <span>${p.name}</span>
        </div>

        <div class="product-detail-inner">

            <div class="product-gallery">
                <div class="gallery-thumbs">
                    <button class="gallery-arrow" id="thumbUp" onclick="scrollThumbs(-1)">▲</button>
                    <div class="thumbs-track" id="thumbsTrack">
                        ${images.map((img, i) => `
                            <img
                                src="${img}"
                                class="thumb-img ${i === 0 ? 'active-thumb' : ''}"
                                onclick="selectImage(${i})"
                                alt="View ${i+1}"
                            >
                        `).join("")}
                    </div>
                    <button class="gallery-arrow" id="thumbDown" onclick="scrollThumbs(1)">▼</button>
                </div>

                <div class="gallery-main">
                    <img id="mainImage" src="${images[0]}" alt="${p.name}">
                </div>
            </div>

            <div class="product-detail-info">
                <h1>${p.name}</h1>
                <p class="detail-availability ${p.available ? "in-stock" : "out-stock"}">
                    ${p.available ? "✔ In Stock" : "✖ Out of Stock"}
                </p>
                <p class="detail-price">$${p.price.toLocaleString()}</p>

                <div class="detail-specs">
                    <div class="spec-row">
                        <span class="spec-label">Metal</span>
                        <span class="spec-value">${p.metal.charAt(0).toUpperCase() + p.metal.slice(1)}</span>
                    </div>
                    <div class="spec-row">
                        <span class="spec-label">Type</span>
                        <span class="spec-value">${p.type.charAt(0).toUpperCase() + p.type.slice(1)}</span>
                    </div>
                    <div class="spec-row">
                        <span class="spec-label">Weight</span>
                        <span class="spec-value">${p.weight} oz</span>
                    </div>
                </div>

                <div class="detail-qty-row">
                    <div class="card-qty">
                        <button class="qty-btn" onclick="changeDetailQty(-1)">−</button>
                        <span class="qty-value" id="detailQty">1</span>
                        <button class="qty-btn" onclick="changeDetailQty(1)">+</button>
                    </div>
                    <button class="add-to-cart-btn detail-cart-btn" id="detailCartBtn" onclick="addToCartDetail()">
                        Add to Cart
                    </button>
                </div>
            </div>

        </div>
    `;
}

function selectImage(index){
    currentImageIndex = index;
    document.getElementById("mainImage").src = images[index];
    document.querySelectorAll(".thumb-img").forEach((img, i) => {
        img.classList.toggle("active-thumb", i === index);
    });
}

let thumbOffset = 0;

function scrollThumbs(direction){
    const track = document.getElementById("thumbsTrack");
    const maxOffset = Math.max(0, images.length - 2);
    thumbOffset = Math.max(0, Math.min(maxOffset, thumbOffset + direction));
    track.style.transform = `translateY(-${thumbOffset * 90}px)`;
}

function changeDetailQty(delta){
    const el = document.getElementById("detailQty");
    let qty = parseInt(el.innerText);
    qty = Math.max(1, qty + delta);
    el.innerText = qty;
}

function addToCartDetail(){
    const qty = parseInt(document.getElementById("detailQty").innerText);
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const existing = cart.find(i => i.id === id);
    if(existing){
        existing.qty += qty;
    } else {
        cart.push({id: id, qty: qty});
    }
    localStorage.setItem("cart", JSON.stringify(cart));
    updateCartCount();
    const btn = document.getElementById("detailCartBtn");
    btn.innerText = "Added!";
    setTimeout(() => btn.innerText = "Add to Cart", 1500);
}

function updateCartCount(){
    const cart = JSON.parse(localStorage.getItem("cart") || "[]");
    const total = cart.reduce((sum, i) => sum + i.qty, 0);
    const el = document.getElementById("cartCount");
    if(el) el.innerText = total;
}

updateCartCount();