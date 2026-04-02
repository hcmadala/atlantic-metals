let history = {
    XAU: JSON.parse(localStorage.getItem("history_XAU")) || [],
    XAG: JSON.parse(localStorage.getItem("history_XAG")) || [],
    XPT: JSON.parse(localStorage.getItem("history_XPT")) || [],
    XPD: JSON.parse(localStorage.getItem("history_XPD")) || []
};

let lastPrice = {};

function saveHistory() {
    localStorage.setItem("history_XAU", JSON.stringify(history.XAU));
    localStorage.setItem("history_XAG", JSON.stringify(history.XAG));
    localStorage.setItem("history_XPT", JSON.stringify(history.XPT));
    localStorage.setItem("history_XPD", JSON.stringify(history.XPD));
}

function getBaseKey() {
    const now = new Date();
    const resetHour = 18;
    let date = new Date(now);
    if (now.getHours() < resetHour) date.setDate(date.getDate() - 1);
    return "base_price_" + date.toISOString().slice(0, 10);
}

function getBasePrice(metal) {
    const key = getBaseKey() + "_" + metal;
    return Number(localStorage.getItem(key));
}

function storeBasePrice(metal, price) {
    const key = getBaseKey() + "_" + metal;
    if (!localStorage.getItem(key)) localStorage.setItem(key, price);
}

// Only push new price at interval
async function fetchAndUpdatePrices() {
    const response = await fetch("/prices"); // your API endpoint
    const data = await response.json();

    updateMetal("gold", "XAU", data);
    updateMetal("silver", "XAG", data);
    updateMetal("platinum", "XPT", data);
    updateMetal("palladium", "XPD", data);

    saveHistory();
    localStorage.setItem("latest_prices", JSON.stringify(data));
}

function updateMetal(name, code, data) {
    const priceElement = document.getElementById(name + "-price");
    if (!priceElement) return;

    const changeElement = document.getElementById(name + "-change");
    const arrowElement = document.getElementById(name + "-arrow");
    const canvas = document.getElementById(name + "-chart");
    const card = priceElement.closest(".metal-card");

    const price = data[code];

    // Push only on interval update
    if (history[code].length === 0 || history[code][history[code].length - 1] !== price) {
        history[code].push(price);
        if (history[code].length > 288) history[code].shift();
    }

    drawSparkline(code, canvas);

    let base = getBasePrice(code);
    if (!base) {
        storeBasePrice(code, price);
        base = price;
    }

    const diff = price - base;

    priceElement.innerText = "$" + price.toFixed(2);
    changeElement.innerText = "$" + diff.toFixed(2);

    if (diff > 0) {
        arrowElement.innerText = "▲";
        arrowElement.className = "arrow positive";
    } else if (diff < 0) {
        arrowElement.innerText = "▼";
        arrowElement.className = "arrow negative";
    } else {
        arrowElement.innerText = "•";
        arrowElement.className = "arrow unchanged";
    }

    if (lastPrice[code] !== undefined) {
        if (price > lastPrice[code]) {
            card.classList.remove("flash-red");
            card.classList.add("flash-green");
        } else if (price < lastPrice[code]) {
            card.classList.remove("flash-green");
            card.classList.add("flash-red");
        }
        setTimeout(() => {
            card.classList.remove("flash-green", "flash-red");
        }, 400);
    }

    lastPrice[code] = price;
}

function drawSparkline(code, canvas) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    ctx.clearRect(0, 0, width, height);

    const prices = history[code];
    if (prices.length < 2) return;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    let range = max - min;
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

    ctx.lineWidth = 2;
    ctx.strokeStyle = upTrend ? "#4ADE80" : "#F87171";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
}

// Draw existing history immediately (flat segments preserved)
drawSparkline("XAU", document.getElementById("gold-chart"));
drawSparkline("XAG", document.getElementById("silver-chart"));
drawSparkline("XPT", document.getElementById("platinum-chart"));
drawSparkline("XPD", document.getElementById("palladium-chart"));

// Refresh on back/forward navigation
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        const data = JSON.parse(localStorage.getItem("latest_prices"));
        const storedHistory = {
            XAU: JSON.parse(localStorage.getItem("history_XAU")) || [],
            XAG: JSON.parse(localStorage.getItem("history_XAG")) || [],
            XPT: JSON.parse(localStorage.getItem("history_XPT")) || [],
            XPD: JSON.parse(localStorage.getItem("history_XPD")) || []
        };
        history = storedHistory;

        if (data) {
            updateMetal("gold", "XAU", data);
            updateMetal("silver", "XAG", data);
            updateMetal("platinum", "XPT", data);
            updateMetal("palladium", "XPD", data);
        }
    }
});

// **Interval-only updates**
fetchAndUpdatePrices();             // first immediate fetch
setInterval(fetchAndUpdatePrices, 10000); // every 10s