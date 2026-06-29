async function loadCoins() {
  const res   = await fetch("/api/coins");
  const coins = await res.json();
  const grid  = document.getElementById("coinGrid");

  if (!coins.length) {
    grid.innerHTML = '<p style="color:#555">No coins yet.</p>';
    return;
  }

  grid.innerHTML = coins.map(coin => `
    <div class="coin-card">
      <img
        src="${coin.placeholder_url || ''}"
        data-src="${coin.card_url || ''}"
        data-srcset="${coin.srcset || ''}"
        alt="${coin.name}"
        class="coin-img lazy"
        width="200" height="200"
        style="filter: blur(8px); transition: filter 0.4s;"
      />
      <p class="coin-name">${coin.name}</p>
      <p class="coin-meta">${coin.metal} · ${coin.weight_oz ?? '?'} oz</p>
    </div>
  `).join("");

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      if (img.dataset.src) {
        img.src    = img.dataset.src;
        img.srcset = img.dataset.srcset || '';
        img.sizes  = "(max-width: 600px) 400px, 800px";
        img.onload = () => { img.style.filter = "none"; };  // blur fades out
      }
      img.classList.remove("lazy");
      observer.unobserve(img);
    });
  }, { rootMargin: "200px" });

  document.querySelectorAll("img.lazy").forEach(img => observer.observe(img));
}

loadCoins();