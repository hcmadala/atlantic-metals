(function () {
    const MAX_RESULTS = 6;
    let activeIndex = -1;
    let resultItems = [];

    function normalize(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[^a-z0-9.]+/g, " ")
            .trim()
            .replace(/\s+/g, " ");
    }

    function productText(product) {
        return [
            product.sku,
            product.name,
            product.metal,
            product.type,
            product.mint,
            product.purity,
            product.weight ? `${product.weight} oz` : ""
        ].join(" ");
    }

    function scoreProduct(product, query) {
        const q = normalize(query);
        if (!q) return 0;

        const sku = normalize(product.sku);
        const name = normalize(product.name);
        const metal = normalize(product.metal);
        const type = normalize(product.type);
        const all = normalize(productText(product));
        const tokens = q.split(" ").filter(Boolean);

        let score = 0;
        if (sku === q) score += 120;
        if (sku.startsWith(q)) score += 90;
        if (name === q) score += 100;
        if (name.startsWith(q)) score += 80;
        if (name.includes(q)) score += 55;
        if (metal === q) score += 45;
        if (type === q) score += 35;
        if (all.includes(q)) score += 25;

        const matchedTokens = tokens.filter(token => all.includes(token)).length;
        if (matchedTokens === tokens.length) score += matchedTokens * 12;
        else score -= 30;

        if (product.available) score += 8;
        return score;
    }

    function getMatches(query) {
        return getProducts()
            .map(product => ({ product, score: scoreProduct(product, query) }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
            .slice(0, MAX_RESULTS);
    }

    function getProducts() {
        try {
            if (typeof products !== "undefined" && Array.isArray(products)) return products;
        } catch {}
        return [];
    }

    function priceLabel(product) {
        if (!product.available) return "Out of Stock";
        if (typeof getLowestPrice === "function") {
            return `As Low As $${getLowestPrice(product.metal, product.type).toFixed(2)} CAD`;
        }
        return `$${Number(product.price || 0).toFixed(2)} CAD`;
    }

    function escapeHTML(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function escapeAttribute(value) {
        return escapeHTML(value).replace(/`/g, "&#96;");
    }

    function searchUrl(query) {
        return `products.html?q=${encodeURIComponent(query.trim())}`;
    }

    function renderDropdown(input, dropdown, query) {
        resultItems = getMatches(query);
        activeIndex = -1;

        if (!query.trim()) {
            dropdown.classList.remove("open");
            dropdown.innerHTML = "";
            return;
        }

        const resultsHTML = resultItems.map(({ product }, index) => `
            <a class="search-suggestion" href="product.html?id=${product.id}" data-index="${index}">
                <img src="${escapeAttribute(product.image)}" alt="${escapeAttribute(product.name)}">
                <span class="search-suggestion-main">
                    <strong>${escapeHTML(product.name)}</strong>
                    <small>${escapeHTML(product.metal)} / ${escapeHTML(product.type)}${product.sku ? ` / ${escapeHTML(product.sku)}` : ""}</small>
                </span>
                <span class="search-suggestion-meta ${product.available ? "" : "out"}">${escapeHTML(priceLabel(product))}</span>
            </a>
        `).join("");

        dropdown.innerHTML = `
            <div class="search-dropdown-head">Product matches</div>
            ${resultsHTML || `<div class="search-empty">No products found for "${escapeHTML(query)}"</div>`}
            <a class="search-view-all" href="${searchUrl(query)}">Search all products for "${escapeHTML(query)}"</a>
        `;
        dropdown.classList.add("open");
    }

    function setActive(dropdown, nextIndex) {
        const items = [...dropdown.querySelectorAll(".search-suggestion")];
        items.forEach(item => item.classList.remove("active"));
        activeIndex = nextIndex;
        if (items[activeIndex]) items[activeIndex].classList.add("active");
    }

    function submitSearch(input) {
        const query = input.value.trim();
        if (!query) return;
        window.location.href = searchUrl(query);
    }

    async function initSearch() {
        const input = document.getElementById("navSearch");
        const productList = getProducts();
        if (!input || !productList.length) return;

        const params = new URLSearchParams(window.location.search);
        const committedQuery = params.get("q") || "";
        if (committedQuery && window.location.pathname.endsWith("/products.html")) {
            input.value = committedQuery;
        }

        const wrap = input.closest(".nav-search-wrap") || input.parentElement;
        let dropdown = wrap.querySelector(".search-dropdown");
        if (!dropdown) {
            dropdown = document.createElement("div");
            dropdown.className = "search-dropdown";
            wrap.appendChild(dropdown);
        }

        input.setAttribute("autocomplete", "off");
        input.setAttribute("aria-autocomplete", "list");

        input.addEventListener("input", () => {
            renderDropdown(input, dropdown, input.value);
        });

        input.addEventListener("keydown", event => {
            const items = [...dropdown.querySelectorAll(".search-suggestion")];
            if (event.key === "ArrowDown" && items.length) {
                event.preventDefault();
                setActive(dropdown, Math.min(activeIndex + 1, items.length - 1));
            } else if (event.key === "ArrowUp" && items.length) {
                event.preventDefault();
                setActive(dropdown, Math.max(activeIndex - 1, 0));
            } else if (event.key === "Enter") {
                event.preventDefault();
                if (activeIndex >= 0 && items[activeIndex]) {
                    window.location.href = items[activeIndex].href;
                } else {
                    submitSearch(input);
                }
            } else if (event.key === "Escape") {
                dropdown.classList.remove("open");
            }
        });

        document.addEventListener("click", event => {
            if (!wrap.contains(event.target)) dropdown.classList.remove("open");
        });

        if (typeof hydrateProductImages === "function") {
            hydrateProductImages(productList).then(() => {
                if (document.activeElement === input && input.value.trim()) {
                    renderDropdown(input, dropdown, input.value);
                }
            });
        }
    }

    document.addEventListener("DOMContentLoaded", initSearch);
})();
