// ── SIGN OUT ──────────────────────────────────────────────────────────────────
async function signOut() {
if (!confirm("Sign out?")) return;
const cart = JSON.parse(localStorage.getItem("cart") || "[]");
try {
    await fetch("/cart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart })
    });
} catch {}
await fetch("/auth/logout", { method: "POST" });
localStorage.removeItem("cart");
window.location.href = "index.html";
}

function bindProfileActions() {
    const actions = {
        "sign-out": signOut,
        "toggle-info": toggleInfoEdit,
        "save-info": saveInfo,
        "toggle-password": togglePwEdit,
        "save-password": savePassword,
        "delete-account": deleteAccount,
        "open-address-form": () => openAddrForm(),
        "close-address-form": closeAddrForm,
        "save-address": saveAddress,
        "open-card-form": openCardForm,
        "close-card-form": closeCardForm,
        "save-card": saveCard
    };

    document.querySelectorAll("[data-profile-action]").forEach(button => {
        button.addEventListener("click", () => actions[button.dataset.profileAction]?.());
    });
    document.querySelectorAll("[data-profile-tab]").forEach(button => {
        button.addEventListener("click", () => switchTab(button.dataset.profileTab));
    });
    document.getElementById("cardLast4")?.addEventListener("input", event => {
        event.target.value = event.target.value.replace(/\D/g, "");
    });
}

// ── AUTH GUARD + INIT ─────────────────────────────────────────────────────────
(async () => {
    bindProfileActions();
    const res = await fetch("/auth/me");
if (!res.ok) {
    window.location.href = "login.html";
    return;
}
const { user } = await res.json();
 // Update navbar to show first name
const navAccount = document.getElementById("navAccount");
if (navAccount) {
    navAccount.textContent = user.name.split(" ")[0];
    navAccount.href = "profile.html";
}
 await loadProfile();
await loadOrders();
})();

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
function switchTab(tab) {
document.querySelectorAll(".profile-tab").forEach((t, i) => {
    const tabs = ["account", "addresses", "cards", "orders"];
    t.classList.toggle("active", tabs[i] === tab);
});
document.querySelectorAll(".profile-panel").forEach(p => p.classList.remove("active"));
document.getElementById("panel-" + tab).classList.add("active");
}

// ── LOAD PROFILE FROM DB ──────────────────────────────────────────────────────
async function loadProfile() {
try {
    const res = await fetch("/profile");
    if (!res.ok) {
        console.error("GET /profile failed:", res.status, await res.text());
        return;
    }
    const data = await res.json();
     // Populate view fields with real data from DB
    document.getElementById("viewFirstName").textContent = data.first_name || "—";
    document.getElementById("viewLastName").textContent  = data.last_name  || "—";
    document.getElementById("viewEmail").textContent     = data.email      || "—";
     // Phone: show value or a clickable "Add phone number" prompt
    const phoneEl = document.getElementById("viewPhone");
    if (data.phone) {
        phoneEl.textContent = data.phone;
        phoneEl.className = "field-value";
    } else {
        phoneEl.innerHTML = '<span class="add-link" onclick="openPhoneEdit()">+ Add phone number</span>';
    }
     // Pre-fill edit inputs with the same DB data
    document.getElementById("editFirstName").value = data.first_name || "";
    document.getElementById("editLastName").value  = data.last_name  || "";
    document.getElementById("editEmail").value     = data.email      || "";
    document.getElementById("editPhone").value     = data.phone      || "";
     renderAddresses(data.addresses   || []);
    renderCards(data.saved_cards     || []);
 } catch (e) {
    console.error("Failed to load profile:", e);
}
}

// ── PERSONAL INFO ─────────────────────────────────────────────────────────────
function toggleInfoEdit() {
const editing = !document.getElementById("infoEdit").classList.contains("hidden");
document.getElementById("infoView").classList.toggle("hidden", !editing);
document.getElementById("infoEdit").classList.toggle("hidden", editing);
document.getElementById("editInfoBtn").textContent = editing ? "Edit" : "Cancel";
document.getElementById("infoMsg").textContent = "";
// Clear any error borders
["editFirstName","editLastName","editEmail","editPhone"].forEach(id =>
    document.getElementById(id).classList.remove("err")
);
}

function openPhoneEdit() {
document.getElementById("infoView").classList.add("hidden");
document.getElementById("infoEdit").classList.remove("hidden");
document.getElementById("editInfoBtn").textContent = "Cancel";
setTimeout(() => document.getElementById("editPhone").focus(), 50);
}

async function saveInfo() {
const firstName = document.getElementById("editFirstName").value.trim();
const lastName  = document.getElementById("editLastName").value.trim();
const email     = document.getElementById("editEmail").value.trim();
const phone     = document.getElementById("editPhone").value.trim();
const msg       = document.getElementById("infoMsg");
msg.textContent = "";
msg.className   = "field-msg";
 // Validation
let valid = true;
if (!firstName) { document.getElementById("editFirstName").classList.add("err"); valid = false; }
if (!lastName)  { document.getElementById("editLastName").classList.add("err");  valid = false; }
if (!email)     { document.getElementById("editEmail").classList.add("err");     valid = false; }
if (!valid) {
    msg.textContent = "First name, last name and email are required.";
    msg.classList.add("error");
    return;
}
 const btn = document.getElementById("saveInfoBtn");
btn.disabled = true;
btn.textContent = "Saving…";
 try {
    const res  = await fetch("/profile", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ firstName, lastName, email, phone })
    });
    const data = await res.json();
     if (!res.ok) {
        msg.textContent = data.error || "Failed to save.";
        msg.classList.add("error");
        return;
    }
     // Update view with saved values
    document.getElementById("viewFirstName").textContent = firstName;
    document.getElementById("viewLastName").textContent  = lastName;
    document.getElementById("viewEmail").textContent     = email;
     const phoneEl = document.getElementById("viewPhone");
    if (phone) {
        phoneEl.textContent = phone;
        phoneEl.className = "field-value";
    } else {
        phoneEl.innerHTML = '<span class="add-link" onclick="openPhoneEdit()">+ Add phone number</span>';
    }
     msg.textContent = "✓ Saved!";
    msg.classList.add("success");
    setTimeout(() => toggleInfoEdit(), 900);
 } catch {
    msg.textContent = "Connection error.";
    msg.classList.add("error");
} finally {
    btn.disabled = false;
    btn.textContent = "Save Changes";
}
}

// ── PASSWORD ──────────────────────────────────────────────────────────────────
function togglePwEdit() {
const editing = !document.getElementById("pwEdit").classList.contains("hidden");
document.getElementById("pwView").classList.toggle("hidden", !editing);
document.getElementById("pwEdit").classList.toggle("hidden", editing);
document.getElementById("editPwBtn").textContent = editing ? "Change" : "Cancel";
document.getElementById("currentPw").value = "";
document.getElementById("newPw").value = "";
document.getElementById("confirmPw").value = "";
document.getElementById("pwMsg").textContent = "";
}

async function savePassword() {
const current = document.getElementById("currentPw").value;
const newPw   = document.getElementById("newPw").value;
const confirm = document.getElementById("confirmPw").value;
const msg     = document.getElementById("pwMsg");
msg.textContent = "";
msg.className   = "field-msg";
 if (!current || !newPw || !confirm) {
    msg.textContent = "All fields are required.";
    msg.classList.add("error");
    return;
}
if (newPw.length < 6) {
    msg.textContent = "New password must be at least 6 characters.";
    msg.classList.add("error");
    return;
}
if (newPw !== confirm) {
    msg.textContent = "New passwords do not match.";
    msg.classList.add("error");
    return;
}
 const btn = document.getElementById("savePwBtn");
btn.disabled = true;
btn.textContent = "Updating…";
 try {
    const res  = await fetch("/profile/password", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ currentPassword: current, newPassword: newPw })
    });
    const data = await res.json();
    if (!res.ok) {
        msg.textContent = data.error || "Failed to update.";
        msg.classList.add("error");
        return;
    }
    msg.textContent = "✓ Password updated!";
    msg.classList.add("success");
    setTimeout(togglePwEdit, 900);
} catch {
    msg.textContent = "Connection error.";
    msg.classList.add("error");
} finally {
    btn.disabled = false;
    btn.textContent = "Update Password";
}
}

// ── ADDRESSES ─────────────────────────────────────────────────────────────────
let editingAddrIndex = null;

function renderAddresses(addresses) {
const list = document.getElementById("addressList");
if (!addresses.length) {
    list.innerHTML = `<div class="empty-state">📭<br>No saved addresses yet.<br><span style="font-size:12px;color:#333">Click "+ Add New" to add one.</span></div>`;
    return;
}
list.innerHTML = addresses.map((a, i) => `
    <div class="address-item">
        <div class="addr-text">
            <strong>${a.firstName} ${a.lastName}</strong><br>
            ${a.street}${a.street2 ? ", " + a.street2 : ""}<br>
            ${a.city}, ${a.province} ${a.postal}<br>
            ${a.country}${a.phone ? "<br>" + a.phone : ""}
            ${i === 0 ? '<div class="default-badge">Default</div>' : ""}
        </div>
        <div class="addr-actions">
            <button class="addr-edit-btn" onclick="editAddress(${i})">Edit</button>
            <button class="addr-del-btn"  onclick="deleteAddress(${i})">Remove</button>
        </div>
    </div>
`).join("");
}

function openAddrForm(index) {
editingAddrIndex = (index !== undefined) ? index : null;
const f = document.getElementById("addrForm");
f.classList.add("open");
if (index === undefined) {
    // Clear all fields for new address
    ["addrFirstName","addrLastName","addrStreet","addrStreet2",
     "addrCity","addrProvince","addrPostal","addrPhone"].forEach(id =>
        document.getElementById(id).value = ""
    );
    document.getElementById("addrCountry").value = "Canada";
}
document.getElementById("addrMsg").textContent = "";
f.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeAddrForm() {
document.getElementById("addrForm").classList.remove("open");
editingAddrIndex = null;
}

async function editAddress(i) {
const res  = await fetch("/profile");
const data = await res.json();
const a    = (data.addresses || [])[i];
if (!a) return;
openAddrForm(i);
document.getElementById("addrFirstName").value = a.firstName || "";
document.getElementById("addrLastName").value  = a.lastName  || "";
document.getElementById("addrStreet").value    = a.street    || "";
document.getElementById("addrStreet2").value   = a.street2   || "";
document.getElementById("addrCity").value      = a.city      || "";
document.getElementById("addrProvince").value  = a.province  || "";
document.getElementById("addrPostal").value    = a.postal    || "";
document.getElementById("addrCountry").value   = a.country   || "Canada";
document.getElementById("addrPhone").value     = a.phone     || "";
}

async function saveAddress() {
const addr = {
    firstName: document.getElementById("addrFirstName").value.trim(),
    lastName:  document.getElementById("addrLastName").value.trim(),
    street:    document.getElementById("addrStreet").value.trim(),
    street2:   document.getElementById("addrStreet2").value.trim(),
    city:      document.getElementById("addrCity").value.trim(),
    province:  document.getElementById("addrProvince").value.trim(),
    postal:    document.getElementById("addrPostal").value.trim(),
    country:   document.getElementById("addrCountry").value.trim(),
    phone:     document.getElementById("addrPhone").value.trim(),
};
const msg = document.getElementById("addrMsg");
msg.textContent = "";
msg.className   = "field-msg";
 if (!addr.firstName || !addr.street || !addr.city || !addr.postal) {
    msg.textContent = "First name, street, city and postal code are required.";
    msg.classList.add("error");
    return;
}
 try {
    const res  = await fetch("/profile/address", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ addr, index: editingAddrIndex })
    });
    const data = await res.json();
    if (!res.ok) {
        msg.textContent = data.error || "Failed to save address.";
        msg.classList.add("error");
        return;
    }
    renderAddresses(data.addresses);
    closeAddrForm();
} catch {
    msg.textContent = "Connection error.";
    msg.classList.add("error");
}
}

async function deleteAddress(i) {
if (!confirm("Remove this address?")) return;
const res  = await fetch(`/profile/address/${i}`, { method: "DELETE" });
const data = await res.json();
if (res.ok) renderAddresses(data.addresses);
}

// ── SAVED CARDS ───────────────────────────────────────────────────────────────
function renderCards(cards) {
const list = document.getElementById("cardList");
if (!cards.length) {
    list.innerHTML = `<div class="empty-state">💳<br>No saved cards yet.</div>`;
    return;
}
list.innerHTML = cards.map((c, i) => `
    <div class="saved-card-item">
        <div class="saved-card-info">
            <div class="card-icon">💳</div>
            <div class="saved-card-details">
                ${c.name ? `<strong>${c.name}</strong><br>` : ""}
                •••• •••• •••• ${c.last4}
                <span>${c.brand} · Expires ${c.expiry}</span>
            </div>
        </div>
        <button class="card-del-btn" onclick="deleteCard(${i})">Remove</button>
    </div>
`).join("");
}

function openCardForm() {
document.getElementById("cardForm").classList.add("open");
document.getElementById("addCardBtn").style.display = "none";
document.getElementById("cardBrand").value = "";
document.getElementById("cardLast4").value = "";
document.getElementById("cardExpiry").value = "";
document.getElementById("cardName").value = "";
document.getElementById("cardMsg").textContent = "";
}

function closeCardForm() {
document.getElementById("cardForm").classList.remove("open");
document.getElementById("addCardBtn").style.display = "";
}

async function saveCard() {
const brand  = document.getElementById("cardBrand").value;
const last4  = document.getElementById("cardLast4").value.trim();
const expiry = document.getElementById("cardExpiry").value.trim();
const name   = document.getElementById("cardName").value.trim();
const msg    = document.getElementById("cardMsg");
msg.textContent = "";
msg.className   = "field-msg";
 if (!brand || !last4 || !expiry) {
    msg.textContent = "Brand, last 4 digits and expiry are required.";
    msg.classList.add("error");
    return;
}
if (!/^\d{4}$/.test(last4)) {
    msg.textContent = "Last 4 must be exactly 4 digits.";
    msg.classList.add("error");
    return;
}
if (!/^\d{2}\/\d{2}$/.test(expiry)) {
    msg.textContent = "Expiry must be in MM/YY format.";
    msg.classList.add("error");
    return;
}
 try {
    const res  = await fetch("/profile/card", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ card: { brand, last4, expiry, name } })
    });
    const data = await res.json();
    if (!res.ok) {
        msg.textContent = data.error || "Failed to save card.";
        msg.classList.add("error");
        return;
    }
    renderCards(data.saved_cards);
    closeCardForm();
} catch {
    msg.textContent = "Connection error.";
    msg.classList.add("error");
}
}

async function deleteCard(i) {
if (!confirm("Remove this card?")) return;
const res  = await fetch(`/profile/card/${i}`, { method: "DELETE" });
const data = await res.json();
if (res.ok) renderCards(data.saved_cards);
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
async function loadOrders() {
const list = document.getElementById("ordersList");
try {
    const res    = await fetch("/orders");
    const orders = await res.json();
     if (!Array.isArray(orders) || !orders.length) {
        list.innerHTML = `<div class="empty-state">📦<br>No orders yet.</div>`;
        return;
    }
     list.innerHTML = orders.map(o => {
        const items = typeof o.items === "string" ? JSON.parse(o.items) : o.items;
        const date  = new Date(o.created_at).toLocaleDateString("en-CA", {
            year: "numeric", month: "short", day: "numeric"
        });
        const statusClass = o.status === "complete" ? "status-complete"
                          : o.status === "shipped"  ? "status-shipped"
                          : "status-pending";
        return `
            <div class="order-item">
                <div class="order-header">
                    <div class="order-meta">
                        <span class="order-id">Order #${o.id}</span>
                        <span class="order-date">${date}</span>
                    </div>
                    <span class="order-status ${statusClass}">${o.status}</span>
                    <span class="order-total">$${Number(o.total).toLocaleString()} CAD</span>
                </div>
                <div class="order-lines">
                    ${items.map(item => `
                        <div class="order-line">
                            <span>${item.qty}× ${item.name}</span>
                            <span>$${(item.price * item.qty).toLocaleString()}</span>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }).join("");
} catch (e) {
    list.innerHTML = `<div class="empty-state">Failed to load orders.</div>`;
}
}

async function deleteAccount() {
const confirmed = confirm(
    "Are you sure you want to delete your account?\nThis cannot be undone."
);
if (!confirmed) return;
 try {
    const res = await fetch("/auth/account", {
        method: "DELETE",
        credentials: "same-origin"  
    });
     const data = await res.json();
    console.log("Delete response:", res.status, data);
     if (res.ok) {
        window.location.href = "login.html";
    } else {
        alert(data.error || "Something went wrong. Please try again.");
    }
} catch (err) {
    console.error(err);
    alert("Connection error. Is the server running?");
}
}
