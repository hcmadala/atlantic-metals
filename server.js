const express = require("express");

const app = express();

app.use(express.static(__dirname));

let cache = {
    data: null,
    timestamp: 0
};

app.get("/prices", async (req, res) => {

    const now = Date.now();

    if (cache.data && now - cache.timestamp < 60000) {
        return res.json(cache.data);
    }

    try {

        const metals = ["XAU","XAG","XPT","XPD"];
        const results = {};

        for(const metal of metals){

            const response = await fetch(`https://api.gold-api.com/price/${metal}`);
            const data = await response.json();

            results[metal] = data.price;

        }

        cache.data = results;
        cache.timestamp = now;

        res.json(results);

    } catch(error){

        console.log("Error fetching prices:", error);

        res.json({
            XAU: null,
            XAG: null,
            XPT: null,
            XPD: null
        });

    }

});

app.listen(3000, () => {

    console.log("Server running on http://localhost:3000");

});