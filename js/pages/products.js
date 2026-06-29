const params = new URLSearchParams(window.location.search);
const metal = params.get("metal");
const type = params.get("type");
const searchQuery = (params.get("q") || "").trim();

let filtered = [];

function escapeHTML(value){
    return String(value ?? "")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;")
        .replace(/"/g,"&quot;")
        .replace(/'/g,"&#39;");
}

function escapeAttribute(value){
    return escapeHTML(value).replace(/`/g,"&#96;");
}

function applyInitialFilter(){
    if(searchQuery){
        filtered=[...products];
        return;
    }
    if(!metal){
        filtered=[...products];
        return;
    }
    if(type){
        filtered=products.filter(p=>p.metal===metal && p.type===type);
    }else{
        filtered=products.filter(p=>p.metal===metal);
    }
}

const container=document.getElementById("productList");

function render(){
    container.innerHTML="";

    if(filtered.length===0){
        const safeSearchQuery = escapeHTML(searchQuery);
        container.innerHTML = `
            <div class="product-empty">
                No products found${searchQuery ? ` for "${safeSearchQuery}"` : ""}.
                ${searchQuery ? `<a href="products.html">View all products</a>` : ""}
            </div>
        `;
    }

    filtered.forEach(p=>{
        const card=document.createElement("div");
        card.className="product-card";

        const lowestPrice = typeof getLowestPrice==="function"
            ? getLowestPrice(p.metal, p.type)
            : p.price;

        const tiers = typeof getPricingTiers==="function"
            ? getPricingTiers(p.metal, p.type)
            : [];

        const tiersHTML = tiers.map((t, i)=>`
            <tr class="${i===0 ? "active-tier" : ""}">
                <td>${escapeHTML(t.label)}</td>
                <td>$${t.wire.toFixed(2)} CAD</td>
            </tr>
        `).join("");

        const productName = escapeHTML(p.name);
        const productImage = escapeAttribute(p.image);
        const productSrcset = p.srcset ? escapeAttribute(p.srcset) : "";

        card.innerHTML=`
        <div class="availability ${p.available?"in-stock":"out-stock"}">
            ${p.available?"In Stock":"Out of Stock"}
        </div>
        <a href="product.html?id=${p.id}" class="card-link">
            <div class="product-img-wrap">
                <img src="${productImage}" alt="${productName}" ${productSrcset ? `srcset="${productSrcset}" sizes="(max-width: 700px) 90vw, 280px"` : ""}>
            </div>
            <h3>${productName}</h3>
        </a>
        <p class="card-price">As Low As <strong>$${lowestPrice.toFixed(2)} CAD</strong></p>
        <div class="pricing-table-wrap">
            <table class="pricing-table">
                <thead>
                    <tr>
                        <th>Quantity</th>
                        <th>Price</th>
                    </tr>
                </thead>
                <tbody>${tiersHTML}</tbody>
            </table>
        </div>
        <div class="card-bottom">
            <div class="card-qty">
                <button class="qty-btn" onclick="changeQty(this,-1)">−</button>
                <span class="qty-value">1</span>
                <button class="qty-btn" onclick="changeQty(this,1)">+</button>
            </div>
            <button class="add-to-cart-btn" ${!p.available?"disabled":""} onclick="addToCart(${p.id},this)">
                ${p.available?"Add to Cart":"Out of Stock"}
            </button>
        </div>
        `;

        container.appendChild(card);
    });

    const countElement=document.getElementById("productCount");
    if(countElement){
        countElement.innerText=searchQuery
            ? `${filtered.length} Products for "${searchQuery}"`
            : filtered.length+" Products";
    }
}

/* BUILD DYNAMIC WEIGHT FILTERS */
function buildWeightFilters(){
    const container = document.getElementById("weightFilterOptions");
    if(!container) return;

    let base = searchQuery || !metal ? [...products] : products.filter(p=>p.metal===metal);
    if(type && !searchQuery) base = base.filter(p=>p.type===type);

    const weights = [...new Set(base.map(p=>p.weight))].sort((a,b)=>a-b);

    container.innerHTML = weights.map(w=>`
        <label>
            <input type="checkbox" class="weightFilter" value="${w}"> ${w} oz
        </label>
    `).join("");

    document.querySelectorAll(".weightFilter").forEach(cb=>{
        cb.addEventListener("change", applyFilters);
    });
}

/* SORT SYSTEM */
const sortToggle=document.getElementById("sortToggle");
const sortDropdown=document.getElementById("sortDropdown");

if(sortDropdown){
    sortDropdown.classList.remove("open");
}

if(sortToggle && sortDropdown){
    sortToggle.addEventListener("click",(e)=>{
        e.stopPropagation();
        sortDropdown.classList.toggle("open");
        const arrow = document.getElementById("sortArrow");
        if(sortDropdown.classList.contains("open")){
            if(arrow) arrow.innerText="∧";
        }else{
            if(arrow) arrow.innerText="∨";
        }
    });
}

const sortLabels = {
    priceLow:   "Price: Low to High",
    priceHigh:  "Price: High to Low",
    weightLow:  "Weight: Low to High",
    weightHigh: "Weight: High to Low"
};

const sortKey = "sort_" + window.location.href;
const filterKey = "filters_" + window.location.href;
const isReload = performance.getEntriesByType("navigation")[0]?.type === "reload";
let currentSort = isReload ? (sessionStorage.getItem(sortKey) || null) : null;
if(!isReload) sessionStorage.clear();

function applySort(){
    if(currentSort){
        if(currentSort==="priceLow")   filtered.sort((a,b)=>a.price-b.price);
        if(currentSort==="priceHigh")  filtered.sort((a,b)=>b.price-a.price);
        if(currentSort==="weightLow")  filtered.sort((a,b)=>a.weight-b.weight);
        if(currentSort==="weightHigh") filtered.sort((a,b)=>b.weight-a.weight);
    }
}

function buildDropdown(){
    sortDropdown.innerHTML="";

    if(currentSort){
        const relevance=document.createElement("div");
        relevance.dataset.sort="relevance";
        relevance.innerText="Relevance";
        sortDropdown.appendChild(relevance);
    }

    Object.entries(sortLabels).forEach(([key,label])=>{
        if(key===currentSort) return;
        const div=document.createElement("div");
        div.dataset.sort=key;
        div.innerText=label;
        sortDropdown.appendChild(div);
    });

    sortDropdown.querySelectorAll("div").forEach(option=>{
        option.addEventListener("click",(e)=>{
            e.stopPropagation();
            const v=option.dataset.sort;

            if(v==="relevance"){
                currentSort=null;
                sessionStorage.removeItem(sortKey);
                sortToggle.innerHTML='Sort <span id="sortArrow">∨</span>';
                applyFilters();
            }else{
                currentSort=v;
                sessionStorage.setItem(sortKey,v);
                applySort();
                sortToggle.innerHTML=sortLabels[v]+' <span id="sortArrow">∨</span>';
                render();
            }

            sortDropdown.classList.remove("open");
            buildDropdown();
        });
    });
}

document.addEventListener("click",()=>{
    if(sortDropdown && sortDropdown.classList.contains("open")){
        sortDropdown.classList.remove("open");
        const arrow=document.getElementById("sortArrow");
        if(arrow) arrow.innerText="∨";
    }
});

/* FILTERS */
const availableFilter=document.getElementById("availableFilter");

function saveFilters(){
    const state = {
        available: availableFilter ? availableFilter.checked : false,
        weights: [...document.querySelectorAll(".weightFilter:checked")].map(c=>c.value)
    };
    sessionStorage.setItem(filterKey, JSON.stringify(state));
}

function restoreFilters(){
    if(!isReload) return;
    const saved = sessionStorage.getItem(filterKey);
    if(!saved) return;
    const state = JSON.parse(saved);
    if(availableFilter) availableFilter.checked = state.available;
    document.querySelectorAll(".weightFilter").forEach(cb=>{
        cb.checked = state.weights.includes(cb.value);
    });
}

function applyFilters(){
    let temp;

    if(searchQuery){
        temp=[...products];
    }else if(metal){
        temp=products.filter(p=>p.metal===metal);
    }else{
        temp=[...products];
    }

    if(type && !searchQuery){
        temp=temp.filter(p=>p.type===type);
    }

    if(availableFilter && availableFilter.checked){
        temp=temp.filter(p=>p.available);
    }

    const selectedWeights=[...document.querySelectorAll(".weightFilter:checked")]
        .map(c=>parseFloat(c.value));

    if(selectedWeights.length>0){
        temp=temp.filter(p=>selectedWeights.includes(p.weight));
    }

    if(searchQuery){
        temp=temp
            .map(p => ({ product: p, score: scoreSearchProduct(p, searchQuery) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
            .map(item => item.product);
    }

    filtered=temp;
    applySort();
    render();
    saveFilters();
}

if(availableFilter){
    availableFilter.addEventListener("change",applyFilters);
}

const clearFilters=document.getElementById("clearFilters");

if(clearFilters){
    clearFilters.addEventListener("click",()=>{
        if(availableFilter) availableFilter.checked=false;
        document.querySelectorAll(".weightFilter").forEach(cb=>{
            cb.checked=false;
        });
        applyFilters();
    });
}

function normalizeSearch(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function scoreSearchProduct(product, query) {
    const q = normalizeSearch(query);
    const fields = [
        product.sku,
        product.name,
        product.metal,
        product.type,
        product.mint,
        product.purity,
        product.weight ? `${product.weight} oz` : ""
    ].join(" ");
    const text = normalizeSearch(fields);
    const name = normalizeSearch(product.name);
    const sku = normalizeSearch(product.sku);
    const tokens = q.split(" ").filter(Boolean);

    let score = 0;
    if (sku === q) score += 120;
    if (sku.startsWith(q)) score += 90;
    if (name === q) score += 100;
    if (name.startsWith(q)) score += 80;
    if (name.includes(q)) score += 55;
    if (text.includes(q)) score += 25;

    const matchedTokens = tokens.filter(token => text.includes(token)).length;
    if (matchedTokens === tokens.length) score += matchedTokens * 12;
    else score -= 30;

    if (product.available) score += 8;
    return score;
}

/* BREADCRUMB */
const breadcrumb=document.getElementById("breadcrumb");

if(breadcrumb){
    let crumbs=`<a href="index.html">Home</a> <span>›</span> <a href="products.html">All</a>`;

    if(searchQuery){
        crumbs+=` <span>›</span> <span>Search: ${escapeHTML(searchQuery)}</span>`;
    }

    if(metal && !searchQuery){
        const safeMetal = escapeAttribute(metal);
        crumbs+=` <span>›</span> <a href="products.html?metal=${safeMetal}">${escapeHTML(metal.charAt(0).toUpperCase()+metal.slice(1))}</a>`;
    }

    if(type && !searchQuery){
        crumbs+=` <span>›</span> <span>${escapeHTML(type.charAt(0).toUpperCase()+type.slice(1))}</span>`;
    }

    breadcrumb.innerHTML=crumbs;
}

/* CART */
function getMaxQty(product) {
    if (!product) return Infinity;
    if (product.qoh !== undefined) return Math.max(0, Number(product.qoh || 0));
    return Infinity;
}

function changeQty(btn, delta){
    const qtyEl = btn.parentElement.querySelector(".qty-value");
    let qty = parseInt(qtyEl.innerText);

    // Update active tier highlight
    const card = btn.closest(".product-card");
    const addBtn = card.querySelector(".add-to-cart-btn");
    const idMatch = addBtn.getAttribute("onclick").match(/\d+/);
    if(!idMatch) return;
    const pid = parseInt(idMatch[0]);
    const prod = products.find(pr => pr.id === pid);
    if(!prod) return;
    const maxQty = getMaxQty(prod);
    qty = Math.max(1, Math.min(maxQty || 1, qty + delta));
    qtyEl.innerText = qty;

    const tiers = typeof getPricingTiers==="function" ? getPricingTiers(prod.metal, prod.type) : [];
    const rows = card.querySelectorAll(".pricing-table tbody tr");

    rows.forEach((row, i) => {
        const tier = tiers[i];
        if(!tier) return;
        const parts = tier.label.includes("+")
            ? [parseInt(tier.label), Infinity]
            : tier.label.split(" - ").map(Number);
        const isActive = qty >= parts[0] && qty <= parts[1];
        row.classList.toggle("active-tier", isActive);
    });
}

function addToCart(id, btn){
    const product = products.find(p => p.id === id);
    const maxQty = getMaxQty(product);
    if (maxQty <= 0) return;

    const requestedQty=parseInt(btn.parentElement.querySelector(".qty-value").innerText);
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    const existing=cart.find(i=>i.id===id);
    const currentQty = existing ? existing.qty : 0;
    const qty = Math.min(requestedQty, Math.max(0, maxQty - currentQty));
    if (qty <= 0) {
        btn.innerText = `Max ${maxQty} in stock`;
        setTimeout(()=>btn.innerText="Add to Cart",1500);
        return;
    }

    if(existing){
        existing.qty+=qty;
    }else{
        cart.push({id:id,qty:qty});
    }
    localStorage.setItem("cart",JSON.stringify(cart));
    updateCartCount();
    btn.innerText="Added!";
    setTimeout(()=>btn.innerText="Add to Cart",1500);
    if(typeof renderCartDrawer==="function") renderCartDrawer();
}

function updateCartCount(){
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    const total=cart.reduce((sum,i)=>sum+i.qty,0);
    const el=document.getElementById("cartCount");
    if(el) el.innerText=total;
}

/* ACTIVE METAL */
if(metal){
    document.querySelectorAll(".metal-item").forEach(item=>{
        const link=item.querySelector("a");
        if(link && link.textContent.trim().toLowerCase()===metal){
            item.classList.add("active-"+metal);
        }
    });
}else{
    document.querySelectorAll(".metal-item").forEach(item=>{
        const link=item.querySelector("a");
        if(link && link.textContent.trim().toLowerCase()==="shop all"){
            item.classList.add("active-all");
        }
    });
}

/* INIT */
async function initProductsPage() {
    if (typeof hydrateProductImages === "function") {
        await hydrateProductImages(products);
    }

    applyInitialFilter();
    buildWeightFilters();
    restoreFilters();

    if(currentSort){
        sortToggle.innerHTML=sortLabels[currentSort]+' <span id="sortArrow">∨</span>';
    }

    applySort();
    buildDropdown();
    if(searchQuery){
        applyFilters();
    }else{
        render();
    }
    updateCartCount();
}

initProductsPage();
