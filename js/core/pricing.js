const MARGINS = {
    gold:     { coins: 0.04,  rounds: 0.03,  bars: 0.025 },
    silver:   { coins: 0.12,  rounds: 0.11,  bars: 0.10  },
    platinum: { coins: 0.06,  rounds: 0.05,  bars: 0.04  },
    palladium:{ coins: 0.06,  rounds: 0.05,  bars: 0.04  }
};

// Credit/PayPal surcharge on top of wire price
const CREDIT_SURCHARGE = 0.04;

const BULK_TIERS = {
    gold: [
        { min: 1,   max: 9,    discount: 0.00 },
        { min: 10,  max: 19,   discount: 50.00 },
        { min: 20,  max: 49,   discount: 75.00 },
        { min: 50,  max: 99,   discount: 100.00 },
        { min: 100, max: Infinity, discount: 125.00 }
    ],
    silver: [
        { min: 1,    max: 24,   discount: 0.00 },
        { min: 25,   max: 99,   discount: 0.50 },
        { min: 100,  max: 499,  discount: 1.00 },
        { min: 500,  max: 1499, discount: 1.50 },
        { min: 1500, max: Infinity, discount: 2.00 }
    ],
    platinum: [
        { min: 1,  max: 9,   discount: 0.00 },
        { min: 10, max: 24,  discount: 25.0 },
        { min: 25, max: 49,  discount: 37.00 },
        { min: 50, max: 99,  discount: 50.00 },
        { min: 100, max: Infinity, discount: 65.00 }
    ],
    palladium: [
        { min: 1,  max: 9,   discount: 0.00 },
        { min: 10, max: 24,  discount: 0.50 },
        { min: 25, max: 49,  discount: 1.00 },
        { min: 50, max: 99,  discount: 1.50 },
        { min: 100, max: Infinity, discount: 2.00 }
    ]
};

function getSpotPrice(metal) {
    const codeMap = { gold: "XAU", silver: "XAG", platinum: "XPT", palladium: "XPD" };
    const code = codeMap[metal];
    try {
        const data = JSON.parse(localStorage.getItem("latest_prices"));
        if (data && data[code]) return data[code];
    } catch(e) {}
    // fallback
    const fallbacks = { gold: 4700, silver: 73, platinum: 2000, palladium: 1530 };
    return fallbacks[metal];
}

function calcWirePrice(metal, type, quantity) {
    const spot = getSpotPrice(metal);
    const margin = MARGINS[metal][type] || 0.05;
    const tiers = BULK_TIERS[metal] || BULK_TIERS.gold;
    const tier = tiers.find(t => quantity >= t.min && quantity <= t.max) || tiers[0];
    const basePrice = spot + (spot * margin);
    return Math.max(0, basePrice - tier.discount);
}

function calcCreditPrice(metal, type, quantity) {
    const wire = calcWirePrice(metal, type, quantity);
    return wire * (1 + CREDIT_SURCHARGE);
}

function getLowestPrice(metal, type) {
    const tiers = BULK_TIERS[metal] || BULK_TIERS.gold;
    const lastTier = tiers[tiers.length - 1];
    return calcWirePrice(metal, type, lastTier.min);
}

function getPricingTiers(metal, type) {
    const tiers = BULK_TIERS[metal] || BULK_TIERS.gold;
    return tiers.map(t => {
        const label = t.max === Infinity
            ? `${t.min}+`
            : `${t.min} - ${t.max}`;
        const wire   = calcWirePrice(metal, type, t.min);
        const credit = calcCreditPrice(metal, type, t.min);
        return { label, wire, credit };
    });
}