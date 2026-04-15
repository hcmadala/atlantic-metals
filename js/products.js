const params = new URLSearchParams(window.location.search);
const metal = params.get("metal");
const type = params.get("type");

let filtered = [];

function applyInitialFilter(){
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
                <td>${t.label}</td>
                <td>$${t.wire.toFixed(2)} CAD</td>
            </tr>
        `).join("");

        card.innerHTML=`
        <div class="availability ${p.available?"in-stock":"out-stock"}">
            ${p.available?"In Stock":"Out of Stock"}
        </div>
        <a href="product.html?id=${p.id}" class="card-link">
            <div class="product-img-wrap">
                <img src="${p.image}" alt="${p.name}">
            </div>
            <h3>${p.name}</h3>
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
        countElement.innerText=filtered.length+" Products";
    }
}

/* BUILD DYNAMIC WEIGHT FILTERS */
function buildWeightFilters(){
    const container = document.getElementById("weightFilterOptions");
    if(!container) return;

    let base = metal ? products.filter(p=>p.metal===metal) : [...products];
    if(type) base = base.filter(p=>p.type===type);

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

    if(metal){
        temp=products.filter(p=>p.metal===metal);
    }else{
        temp=[...products];
    }

    if(type){
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

    const query = searchInput?.value.trim().toLowerCase() || "";
    if(query){
        temp=temp.filter(p=>
            p.name.toLowerCase().includes(query)||
            p.metal.toLowerCase().includes(query)||
            p.type.toLowerCase().includes(query)
        );
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

/* SEARCH */
const searchInput=document.getElementById("navSearch");

if(searchInput){
    searchInput.addEventListener("input",()=>{
        applyFilters();
    });
}

/* BREADCRUMB */
const breadcrumb=document.getElementById("breadcrumb");

if(breadcrumb){
    let crumbs=`<a href="index.html">Home</a> <span>›</span> <a href="products.html">All</a>`;

    if(metal){
        crumbs+=` <span>›</span> <a href="products.html?metal=${metal}">${metal.charAt(0).toUpperCase()+metal.slice(1)}</a>`;
    }

    if(type){
        crumbs+=` <span>›</span> <span>${type.charAt(0).toUpperCase()+type.slice(1)}</span>`;
    }

    breadcrumb.innerHTML=crumbs;
}

/* CART */
function changeQty(btn, delta){
    const qtyEl = btn.parentElement.querySelector(".qty-value");
    let qty = parseInt(qtyEl.innerText);
    qty = Math.max(1, qty + delta);
    qtyEl.innerText = qty;

    // Update active tier highlight
    const card = btn.closest(".product-card");
    const addBtn = card.querySelector(".add-to-cart-btn");
    const idMatch = addBtn.getAttribute("onclick").match(/\d+/);
    if(!idMatch) return;
    const pid = parseInt(idMatch[0]);
    const prod = products.find(pr => pr.id === pid);
    if(!prod) return;

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
    const qty=parseInt(btn.parentElement.querySelector(".qty-value").innerText);
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    const existing=cart.find(i=>i.id===id);
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
applyInitialFilter();
buildWeightFilters();
restoreFilters();

if(currentSort){
    sortToggle.innerHTML=sortLabels[currentSort]+' <span id="sortArrow">∨</span>';
}

applySort();
buildDropdown();
render();
updateCartCount();