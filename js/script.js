// History is now provided by the server — no more localStorage building.
// On every fetch the server returns both the current price AND the last 30
// historical data points recorded from the background worker, so every
// device (phone, laptop, desktop) renders the exact same sparkline.

let history = { XAU: [], XAG: [], XPT: [], XPD: [] };
let lastPrice = {};

// Base price for the daily % change calculation.
// We still persist this in localStorage because it only needs to survive
// within the same browser session — it's not shared across devices.
function getBaseKey() {
  const now = new Date();
  const resetHour = 18;
  let date = new Date(now);
  if (now.getHours() < resetHour) date.setDate(date.getDate() - 1);
  return "base_price_" + date.toISOString().slice(0, 10);
}

function getBasePrice(metal) {
  return Number(localStorage.getItem(getBaseKey() + "_" + metal));
}

function storeBasePrice(metal, price) {
  const key = getBaseKey() + "_" + metal;
  if (!localStorage.getItem(key)) localStorage.setItem(key, price);
}

// ─── Main fetch ──────────────────────────────────────────────────────────────
async function fetchAndUpdatePrices() {
  let data;

  try {
    const response = await fetch("/prices");
    data = await response.json();
  } catch (e) {
    // Hard fallback — approximate current USD spot prices
    data = {
      XAU: 4700,
      XAG: 73,
      XPT: 2000,
      XPD: 1530,
      history: { XAU: [], XAG: [], XPT: [], XPD: [] }
    };
  }

  // Use the server-supplied history arrays as the source of truth.
  // Append the current live price so the chart always ends at "now".
  const serverHistory = data.history || { XAU: [], XAG: [], XPT: [], XPD: [] };

  for (const code of ["XAU", "XAG", "XPT", "XPD"]) {
    const pts = Array.isArray(serverHistory[code]) ? [...serverHistory[code]] : [];
    // Append current price if it differs from the last history point
    if (data[code] != null) {
      if (pts.length === 0 || pts[pts.length - 1] !== data[code]) {
        pts.push(data[code]);
      }
    }
    history[code] = pts;
  }

  // Store latest prices for pricing.js (cart / product page calculations)
  localStorage.setItem("latest_prices", JSON.stringify({
    XAU: data.XAU,
    XAG: data.XAG,
    XPT: data.XPT,
    XPD: data.XPD
  }));

  updateMetal("gold",      "XAU", data);
  updateMetal("silver",    "XAG", data);
  updateMetal("platinum",  "XPT", data);
  updateMetal("palladium", "XPD", data);
}

// ─── Per-metal update ────────────────────────────────────────────────────────
function updateMetal(name, code, data) {
  const priceElement  = document.getElementById(name + "-price");
  if (!priceElement) return;

  const changeElement = document.getElementById(name + "-change");
  const arrowElement  = document.getElementById(name + "-arrow");
  const canvas        = document.getElementById(name + "-chart");
  const card          = priceElement.closest(".metal-card");

  const price = data[code];
  if (price == null) return;

  // Draw sparkline from server-supplied history
  drawSparkline(code, canvas);

  // Daily change
  let base = getBasePrice(code);
  if (!base) {
    storeBasePrice(code, price);
    base = price;
  }
  const diff = price - base;

  priceElement.innerText  = "$" + price.toFixed(2);
  changeElement.innerText = "$" + diff.toFixed(2);

  if (diff > 0) {
    arrowElement.innerText   = "▲";
    arrowElement.className   = "arrow positive";
  } else if (diff < 0) {
    arrowElement.innerText   = "▼";
    arrowElement.className   = "arrow negative";
  } else {
    arrowElement.innerText   = "•";
    arrowElement.className   = "arrow unchanged";
  }

  // Flash card on price movement
  if (lastPrice[code] !== undefined && card) {
    if (price > lastPrice[code]) {
      card.classList.remove("flash-red");
      card.classList.add("flash-green");
    } else if (price < lastPrice[code]) {
      card.classList.remove("flash-green");
      card.classList.add("flash-red");
    }
    setTimeout(() => card.classList.remove("flash-green", "flash-red"), 400);
  }

  lastPrice[code] = price;
}

// ─── Sparkline renderer ───────────────────────────────────────────────────────
function drawSparkline(code, canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const width  = canvas.width  = canvas.offsetWidth;
  const height = canvas.height = canvas.offsetHeight;

  ctx.clearRect(0, 0, width, height);

  const prices = history[code];
  if (!prices || prices.length < 2) return;

  const min   = Math.min(...prices);
  const max   = Math.max(...prices);
  let   range = max - min;
  if (range < 0.01) range = 0.01;

  const points = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * width,
    y: height - ((p - min) / range) * height
  }));

  const upTrend = prices[prices.length - 1] >= prices[0];

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }

  const last = points.length - 1;
  ctx.quadraticCurveTo(
    points[last - 1].x,
    points[last - 1].y,
    points[last].x,
    points[last].y
  );

  ctx.lineWidth   = 2;
  ctx.strokeStyle = upTrend ? "#4ADE80" : "#F87171";
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";
  ctx.stroke();
}

// ─── Visibility change (back/forward navigation) ─────────────────────────────
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) fetchAndUpdatePrices();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
fetchAndUpdatePrices();                        // immediate fetch on page load
setInterval(fetchAndUpdatePrices, 10 * 1000); // refresh every 10 seconds