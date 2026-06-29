const API = "";  // same origin
  const coinNames = new Map();
  let allInventory = [];

  function escapeHTML(value) {
return String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
return escapeHTML(value);
  }

  // ── Auth check ──
  async function checkAuth() {
try {
  const res = await fetch(`${API}/auth/me`, { credentials: "include" });
  const data = await res.json();
  if (res.ok && data.user?.isAdmin) {
    document.getElementById("adminContent").classList.remove("is-hidden");
    loadCoins();
  } else {
    document.getElementById("authGate").classList.remove("is-hidden");
  }
} catch {
  document.getElementById("authGate").classList.remove("is-hidden");
}
  }

  // ── Toast ──
  function toast(msg, type = "success") {
const el = document.getElementById("toast");
el.className = `show ${type}`;
document.getElementById("toastMsg").textContent = msg;
setTimeout(() => { el.className = ""; }, 3000);
  }

  // ── Load coins ──
  async function loadCoins() {
try {
  const res = await fetch(`${API}/api/coins`, { credentials: "include" });
  const coins = await res.json();
  allInventory = Array.isArray(coins) ? coins : [];
   // Stats
  const withImages = allInventory.filter(c => c.image_key).length;
  document.getElementById("statTotal").textContent = allInventory.length;
  document.getElementById("statWithImages").textContent = withImages;
  document.getElementById("statNoImages").textContent = allInventory.length - withImages;
   renderInventory();
} catch (err) {
  console.error(err);
  toast("Failed to load inventory", "error");
}
  }

  function filteredInventory() {
const query = document.getElementById("inventorySearch")?.value.trim().toLowerCase() || "";
const type = document.getElementById("inventoryTypeFilter")?.value || "";
const stock = document.getElementById("inventoryStockFilter")?.value || "";
 return allInventory.filter(item => {
  const haystack = [item.name, item.sku, item.mint, item.metal].join(" ").toLowerCase();
  if (query && !haystack.includes(query)) return false;
  if (type && item.product_type !== type) return false;
  if (stock === "in" && Number(item.qoh || 0) <= 0) return false;
  if (stock === "out" && Number(item.qoh || 0) > 0) return false;
  if (stock === "missing-image" && item.image_key) return false;
  return true;
});
  }

  function renderInventory() {
  const coins = filteredInventory();
  const grid = document.getElementById("coinsGrid");
  if (!coins.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🪙</div>No coins yet. Add one above.</div>`;
    return;
  }
  coinNames.clear();
  coins.forEach(coin => coinNames.set(Number(coin.id), coin.name));
  grid.innerHTML = coins.map(coin => renderCoinCard(coin)).join("");
  }

  function renderCoinCard(coin) {
const img1 = coin.image1?.card_url || coin.card_url || null;
const img2 = coin.image2?.card_url || null;
const id = Number(coin.id);
const name = escapeHTML(coin.name);
const sku = escapeHTML(coin.sku || "");
const metal = escapeHTML(coin.metal);
const type = escapeHTML(coin.product_type || "coins");
const mint = escapeHTML(coin.mint);
const weight = coin.weight_oz ? ` · ${escapeHTML(coin.weight_oz)} oz` : "";
const qoh = Number(coin.qoh || 0);
const stockClass = qoh > 0 ? "success" : "error";
const stockText = qoh > 0 ? `${qoh} in stock` : "Out of stock";
const imgAlt = escapeAttr(`${coin.name} image`);
 const slot = (imgUrl, slot) => `
  <div class="coin-img-slot" id="slot-${id}-${slot}">
    ${imgUrl
      ? `<img src="${escapeAttr(imgUrl)}" alt="${imgAlt} ${slot}" loading="lazy">`
      : `<div style="width:100%;height:100%;background:#0d0d0d;display:flex;align-items:center;justify-content:center;font-size:28px;color:#2D3135">🪙</div>`
    }
    <span class="img-label">${slot === 1 ? 'Front' : 'Back'}</span>
    <div class="img-overlay">
      <span class="upload-icon">↑</span>
      <span>${imgUrl ? 'Replace' : 'Upload'}</span>
    </div>
    <input type="file" accept="image/*" onchange="uploadImage(event, ${id}, ${slot})" title="Upload image ${slot}">
  </div>`;
 return `
  <div class="coin-card" id="card-${id}">
    <div class="coin-images">
      ${slot(img1, 1)}
      ${slot(img2, 2)}
    </div>
    <div class="coin-info">
      <div class="coin-name">${name}</div>
      <div class="coin-meta">${sku} · ${type} · ${metal}${weight}${coin.mint ? ' · ' + mint : ''}</div>
      <div class="edit-grid">
        <input id="edit-sku-${id}" value="${sku}" placeholder="SKU">
        <input id="edit-name-${id}" value="${name}" placeholder="Name">
        <select id="edit-metal-${id}">
          ${["gold","silver","platinum","palladium"].map(m => `<option value="${m}" ${coin.metal === m ? "selected" : ""}>${m}</option>`).join("")}
        </select>
        <select id="edit-type-${id}">
          ${["coins","bars","rounds"].map(t => `<option value="${t}" ${(coin.product_type || "coins") === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <input id="edit-mint-${id}" value="${mint}" placeholder="Mint">
        <input id="edit-weight-${id}" type="number" step="0.001" value="${coin.weight_oz ?? ""}" placeholder="Weight">
        <input id="edit-purity-${id}" value="${escapeAttr(coin.purity || "")}" placeholder="Purity">
        <input id="edit-year-${id}" type="number" value="${coin.year ?? ""}" placeholder="Year">
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin:12px 0">
        <label style="margin:0;color:#94A3B8">QOH</label>
        <input
          type="number"
          id="edit-qoh-${id}"
          min="0"
          step="1"
          value="${qoh}"
          onchange="updateQoh(${id}, this.value)"
          style="max-width:90px;padding:6px 8px"
        >
        <span style="font-size:11px;color:${stockClass === 'success' ? '#4ADE80' : '#F87171'}">${stockText}</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div class="coin-id">ID: ${id}</div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" onclick="saveItem(${id})">Save</button>
          <button class="btn btn-danger" onclick="deleteCoin(${id})">Delete</button>
        </div>
      </div>
    </div>
  </div>`;
  }

  // ── Add coin ──
  async function addCoin() {
const name     = document.getElementById("fName").value.trim();
const sku      = document.getElementById("fSku").value.trim();
const metal    = document.getElementById("fMetal").value;
const type     = document.getElementById("fType").value;
const mint     = document.getElementById("fMint").value.trim();
const weight   = document.getElementById("fWeight").value;
const purity   = document.getElementById("fPurity").value.trim();
const year     = document.getElementById("fYear").value;
const qoh      = document.getElementById("fQoh").value;
const status   = document.getElementById("addStatus");
 if (!name || !sku || !metal) { toast("Name, SKU and metal are required", "error"); return; }
 status.textContent = "Adding...";
try {
  const res = await fetch(`${API}/api/coins`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, name, metal, product_type: type, mint: mint || undefined, weight_oz: weight || undefined, purity: purity || undefined, year: year || undefined, qoh: qoh || 0 })
  });
  const data = await res.json();
  if (data.id) {
    toast(`Coin added (ID: ${data.id})`);
    status.textContent = "";
    ["fSku","fName","fMint","fWeight","fPurity","fYear"].forEach(id => document.getElementById(id).value = "");
    document.getElementById("fQoh").value = "0";
    document.getElementById("fMetal").value = "";
    loadCoins();
  } else {
    toast(data.error || "Failed to add coin", "error");
    status.textContent = "";
  }
} catch (err) {
  toast("Network error", "error");
  status.textContent = "";
}
  }

  async function saveItem(id) {
const body = {
  sku: document.getElementById(`edit-sku-${id}`).value.trim(),
  name: document.getElementById(`edit-name-${id}`).value.trim(),
  metal: document.getElementById(`edit-metal-${id}`).value,
  product_type: document.getElementById(`edit-type-${id}`).value,
  mint: document.getElementById(`edit-mint-${id}`).value.trim(),
  weight_oz: document.getElementById(`edit-weight-${id}`).value,
  purity: document.getElementById(`edit-purity-${id}`).value.trim(),
  year: document.getElementById(`edit-year-${id}`).value,
  qoh: document.getElementById(`edit-qoh-${id}`).value || 0
};
if (!body.sku || !body.name || !body.metal) {
  toast("SKU, name and metal are required", "error");
  return;
}
try {
  const res = await fetch(`${API}/api/coins/${id}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json();
    toast(data.error || "Failed to save item", "error");
    return;
  }
  toast("Item saved");
  loadCoins();
} catch {
  toast("Network error", "error");
}
  }

  // ── Update stock ──
  async function updateQoh(id, value) {
const qoh = Math.max(0, parseInt(value, 10) || 0);
try {
  const res = await fetch(`${API}/api/coins/${id}/stock`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ qoh })
  });
  if (res.ok) {
    toast(`QOH updated to ${qoh}`);
    loadCoins();
  } else {
    const data = await res.json();
    toast(data.error || "Failed to update QOH", "error");
  }
} catch {
  toast("Network error", "error");
}
  }

  // ── Upload image ──
  async function uploadImage(event, coinId, slot) {
const file = event.target.files[0];
if (!file) return;
 const slotEl = document.getElementById(`slot-${coinId}-${slot}`);
slotEl.classList.add("uploading");
slotEl.querySelector(".img-overlay").innerHTML = `<span class="upload-icon upload-spinner">⟳</span><span>Uploading...</span>`;
 const formData = new FormData();
formData.append("image", file);
 try {
  const res = await fetch(`${API}/api/coins/${coinId}/image/${slot}`, {
    method: "POST",
    credentials: "include",
    body: formData
  });
  const data = await res.json();
  if (data.success) {
    toast(`Image ${slot === 1 ? 'front' : 'back'} uploaded`);
    loadCoins();
  } else {
    toast(data.error || "Upload failed", "error");
    slotEl.classList.remove("uploading");
    slotEl.querySelector(".img-overlay").innerHTML = `<span class="upload-icon">↑</span><span>Upload</span>`;
  }
} catch (err) {
  toast("Upload error", "error");
  slotEl.classList.remove("uploading");
}
  }

  // ── Delete coin ──
  async function deleteCoin(id) {
const name = coinNames.get(Number(id)) || "this coin";
if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
try {
  const res = await fetch(`${API}/api/coins/${id}`, {
    method: "DELETE",
    credentials: "include"
  });
  if (res.ok) {
    toast(`"${name}" deleted`);
    loadCoins();
  } else {
    toast("Delete failed", "error");
  }
} catch {
  toast("Network error", "error");
}
  }

  checkAuth();
  document.getElementById("addCoinBtn")?.addEventListener("click", addCoin);
  document.getElementById("inventorySearch")?.addEventListener("input", renderInventory);
  document.getElementById("inventoryTypeFilter")?.addEventListener("change", renderInventory);
  document.getElementById("inventoryStockFilter")?.addEventListener("change", renderInventory);
