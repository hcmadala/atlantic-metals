function openCart(){
    document.getElementById("cartDrawer").classList.add("open");
    document.getElementById("cartOverlay").classList.add("open");
    renderCartDrawer();
}

function closeCart(){
    document.getElementById("cartDrawer").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
}

function renderCartDrawer(){
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    const itemsEl=document.getElementById("cartDrawerItems");
    const totalEl=document.getElementById("cartTotal");

    if(!itemsEl) return;

    if(cart.length===0){
        itemsEl.innerHTML=`<p class="cart-empty">Your cart is empty.</p>`;
        if(totalEl) totalEl.innerText="$0.00";
        updateCartCount();
        return;
    }

    let total=0;

    itemsEl.innerHTML=cart.map((item,cartIndex)=>{
        const p=products[item.id];
        if(!p) return "";
        const subtotal=p.price*item.qty;
        total+=subtotal;
        return `
            <div class="cart-item">
                <img src="${p.image}" alt="${p.name}" class="cart-item-img">
                <div class="cart-item-info">
                    <p class="cart-item-name">${p.name}</p>
                    <p class="cart-item-subtotal">$${subtotal.toLocaleString()}</p>
                    <div class="cart-item-controls">
                        <div class="card-qty">
                            <button class="qty-btn" onclick="cartChangeQty(${cartIndex},-1)">−</button>
                            <span class="qty-value">${item.qty}</span>
                            <button class="qty-btn" onclick="cartChangeQty(${cartIndex},1)">+</button>
                        </div>
                        <button class="cart-remove-btn" onclick="cartRemove(${cartIndex})">Remove</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    if(totalEl) totalEl.innerText="$"+total.toLocaleString();
    updateCartCount();
}

function cartChangeQty(cartIndex,delta){
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    cart[cartIndex].qty=Math.max(1,cart[cartIndex].qty+delta);
    localStorage.setItem("cart",JSON.stringify(cart));
    renderCartDrawer();
}

function cartRemove(cartIndex){
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    cart.splice(cartIndex,1);
    localStorage.setItem("cart",JSON.stringify(cart));
    renderCartDrawer();
}

function updateCartCount(){
    const cart=JSON.parse(localStorage.getItem("cart")||"[]");
    const total=cart.reduce((sum,i)=>sum+i.qty,0);
    const el=document.getElementById("cartCount");
    if(el) el.innerText=total;
}

// Wire up buttons
document.addEventListener("DOMContentLoaded",()=>{
    const cartBtn=document.getElementById("cartBtn");
    const cartCloseBtn=document.getElementById("cartCloseBtn");
    const cartOverlay=document.getElementById("cartOverlay");

    if(cartBtn) cartBtn.addEventListener("click", openCart);
    if(cartCloseBtn) cartCloseBtn.addEventListener("click", closeCart);
    if(cartOverlay) cartOverlay.addEventListener("click", closeCart);
});