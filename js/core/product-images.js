(function () {
    let hydratePromise = null;

    function normalizeName(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/\b(19|20)\d{2}\b/g, "")
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
            .replace(/\s+/g, " ");
    }

    function getPrimaryImage(coin) {
        return coin.image1?.card_url || coin.card_url || coin.image1?.detail_url || coin.detail_url || null;
    }

    function getDetailImage(coin) {
        return coin.image1?.detail_url || coin.detail_url || coin.image1?.card_url || coin.card_url || null;
    }

    function getSecondImage(coin) {
        return coin.image2?.detail_url || coin.image2?.card_url || null;
    }

    window.hydrateProductImages = function hydrateProductImages(productList) {
        if (hydratePromise) return hydratePromise;

        hydratePromise = fetch("/api/coins")
            .then(res => res.ok ? res.json() : [])
            .then(coins => {
                const byName = new Map();
                const bySku = new Map();
                coins.forEach(coin => {
                    if (coin.sku) bySku.set(coin.sku, coin);
                    byName.set(normalizeName(coin.name), coin);
                });

                productList.forEach(product => {
                    product.qoh = 0;
                    product.available = false;

                    const coin = bySku.get(product.sku) || byName.get(normalizeName(product.name));
                    if (!coin) return;

                    const primary = getPrimaryImage(coin);
                    const detail = getDetailImage(coin);
                    const second = getSecondImage(coin);

                    if (primary) product.image = primary;
                    if (detail) product.imageDetail = detail;
                    if (second) product.image2 = second;
                    if (coin.srcset) product.srcset = coin.srcset;

                    product.qoh = Number(coin.qoh || 0);
                    product.available = product.qoh > 0;
                });
            })
            .catch(err => {
                console.warn("Could not load admin coin images", err);
            });

        return hydratePromise;
    };
})();
