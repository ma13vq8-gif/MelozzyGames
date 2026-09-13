// ---- SPA Routing ----
let currentPage = 'home';
let currentItemId = null;
let currentSort = 'newest';
let currentSearch = '';
let currentPageNum = 1;
let currentLimit = 20;
let allItemsCache = [];
let heroInterval = null;

// Quick View timers
let quickViewShowTimer = null;
let quickViewHideTimer = null;
let quickViewActive = false;

// Security popup flag – resets on refresh
let securityPopupShown = false;

// ---- CART STATE ----
let cart = JSON.parse(localStorage.getItem('melozzyCart')) || { items: [], promo: null };
if (Array.isArray(cart)) {
  const oldItems = cart;
  cart = { items: oldItems, promo: null };
}
function saveCart() {
  localStorage.setItem('melozzyCart', JSON.stringify(cart));
}

const app = document.getElementById('app');

// ===== LOADING SCREEN =====
let loadingCount = 0;
let loadingTimeout = null;

function showLoading() {
  loadingCount++;
  if (loadingTimeout) {
    clearTimeout(loadingTimeout);
    loadingTimeout = null;
  }
  loadingTimeout = setTimeout(() => {
    let overlay = document.getElementById('loadingOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'loading-overlay';
      overlay.innerHTML = `
        <div class="loading-content">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading <span class="loading-dots"></span></div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.classList.add('show');
  }, 300);
}

function hideLoading() {
  loadingCount--;
  if (loadingCount < 0) loadingCount = 0;
  if (loadingCount === 0) {
    if (loadingTimeout) {
      clearTimeout(loadingTimeout);
      loadingTimeout = null;
    }
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => {
        if (overlay && loadingCount === 0) {
          overlay.remove();
        }
      }, 400);
    }
  }
}

// ---- Helpers ----
function getCurrencySymbol() {
  const locale = navigator.language || 'en-US';
  const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).formatToParts(0);
  const found = parts.find(p => p.type === 'currency');
  return found ? found.value : '$';
}
const CURRENCY = getCurrencySymbol();

function formatPrice(price) {
  if (price === 0) return 'FREE';
  return `${CURRENCY}${(price / 100).toFixed(2)}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// ---- Global Rating Calculation ----
function calculateGlobalRating(items) {
  let totalStars = 0;
  let totalVotes = 0;
  items.forEach(g => {
    if (g.totalStars && g.totalVotes) {
      totalStars += g.totalStars;
      totalVotes += g.totalVotes;
    }
  });
  if (totalVotes === 0) return null;
  const avg = totalStars / totalVotes;
  return {
    avg: avg,
    percent: Math.round((avg / 5) * 100),
    votes: totalVotes
  };
}

// ---- Cart Functions ----
function updateCartCount() {
  const badge = document.getElementById('cartBadge');
  const count = cart.items ? cart.items.length : 0;
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-block' : 'none';
  }
}

function getCartTotal() {
  const items = cart.items || [];
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  if (cart.promo) {
    const discountPercent = cart.promo.discount || 0;
    const discountAmount = (subtotal * discountPercent) / 100;
    return subtotal - discountAmount;
  }
  return subtotal;
}

function addToCart(item) {
  if (!cart.items) cart.items = [];
  if (cart.items.some(i => i.id === item.id)) {
    alert('This item is already in your cart!');
    return;
  }
  cart.items.push({ ...item, _type: item._type || 'game' });
  saveCart();
  updateCartCount();
  alert(`${item.name} added to cart! 🛒`);
}

function removeFromCart(itemId) {
  if (!cart.items) cart.items = [];
  cart.items = cart.items.filter(item => item.id !== itemId);
  if (cart.items.length === 0) {
    cart.promo = null;
  }
  saveCart();
  updateCartCount();
  renderCart();
}

async function applyPromoCode(code) {
  try {
    const res = await fetch('/api/apply-promo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + data.error);
      return;
    }
    cart.promo = { code: data.code, discount: data.discount };
    saveCart();
    renderCart();
    alert(`✅ Promo code applied! ${data.discount}% off!`);
  } catch (err) {
    alert('❌ Something went wrong. Please try again.');
  }
}

function removePromo() {
  cart.promo = null;
  saveCart();
  renderCart();
}

// ===== SCROLL SLIDER (Pill drag) =====
function initScrollSliders() {
  const wrappers = document.querySelectorAll('.game-scroll-wrapper');
  wrappers.forEach(wrapper => {
    const container = wrapper.querySelector('.game-scroll-inner');
    const thumb = wrapper.querySelector('.scroll-thumb');
    const track = wrapper.querySelector('.scroll-track');
    if (!container || !thumb || !track) return;

    function updateThumb() {
      const maxScroll = container.scrollWidth - container.clientWidth;
      const scrollPercent = maxScroll > 0 ? container.scrollLeft / maxScroll : 0;
      const trackWidth = track.clientWidth - thumb.offsetWidth;
      thumb.style.left = (scrollPercent * trackWidth) + 'px';
    }

    updateThumb();
    container.addEventListener('scroll', updateThumb);

    let isDragging = false;
    let startX = 0;
    let startScrollLeft = 0;

    function startDrag(e) {
      isDragging = true;
      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      startX = clientX;
      startScrollLeft = container.scrollLeft;
      thumb.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onDrag);
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchmove', onDrag, { passive: false });
      document.addEventListener('touchend', endDrag);
      e.preventDefault();
    }

    function onDrag(e) {
      if (!isDragging) return;
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - startX;
      const maxScroll = container.scrollWidth - container.clientWidth;
      const trackWidth = track.clientWidth - thumb.offsetWidth;
      const scrollRatio = trackWidth > 0 ? deltaX / trackWidth : 0;
      let newScrollLeft = startScrollLeft + scrollRatio * maxScroll;
      newScrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll));
      container.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    }

    function endDrag() {
      isDragging = false;
      thumb.style.cursor = 'grab';
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', endDrag);
      document.removeEventListener('touchmove', onDrag);
      document.removeEventListener('touchend', endDrag);
    }

    thumb.addEventListener('mousedown', startDrag);
    thumb.addEventListener('touchstart', startDrag, { passive: false });

    track.addEventListener('click', (e) => {
      if (e.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const clickX = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
      const trackWidth = track.clientWidth - thumb.offsetWidth;
      const scrollRatio = trackWidth > 0 ? Math.min(1, Math.max(0, clickX / trackWidth)) : 0;
      const maxScroll = container.scrollWidth - container.clientWidth;
      container.scrollTo({ left: scrollRatio * maxScroll, behavior: 'smooth' });
    });

    const ro = new ResizeObserver(() => updateThumb());
    ro.observe(container);
  });
}

// ---- Render Functions ----

// GRID CARD (with badges)
function renderItemCard(item) {
  const imgSrc = `/${item._type === 'movie' ? 'movies' : 'games'}/${item.id}/${item.screenshot}`;
  const isMod = item.tags.some(t => t.toLowerCase() === 'mod');
  const isReupload = item.tags.some(t => t.toLowerCase() === 'reupload');
  const isRip = item.tags.some(t => t.toLowerCase() === 'rip');
  const itemData = JSON.stringify(item).replace(/'/g, "&#39;");

  return `
    <div class="game-card" data-id="${item.id}" data-type="${item._type}" data-item='${itemData}'>
      <div class="card-image-wrap">
        <img src="${imgSrc}" alt="${item.name}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22%3E%3Crect fill=%22%231A1512%22 width=%22320%22 height=%22180%22/%3E%3Ctext x=%22160%22 y=%2290%22 text-anchor=%22middle%22 fill=%22%236B5A4A%22 font-family=%22sans-serif%22 font-size=%2216%22%3E🎮 No Image%3C/text%3E%3C/svg%3E'" />
        <div class="badge-group-left">
          ${isReupload ? '<div class="reupload-badge">REUPLOAD</div>' : ''}
        </div>
        ${isMod ? '<div class="mod-badge">MOD</div>' : ''}
        ${isRip ? '<div class="rip-badge" style="position:absolute;top:6px;left:50%;transform:translateX(-50%);background:#c95f5f;color:white;font-size:0.5rem;font-weight:800;padding:2px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:0.3px;">🪦 RIP</div>' : ''}
        <div class="item-type-badge" style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.6);color:#fff;font-size:0.5rem;padding:2px 8px;border-radius:12px;backdrop-filter:blur(4px);">${item.tags.some(t => t.toLowerCase() === 'tool') ? '🔧 App' : '🎮 Game'}</div>
      </div>
      <div class="info">
        <h3>${item.name}</h3>
        <div class="desc">${item.description}</div>
        <div class="meta">
          <span class="${item.price === 0 ? 'price-tag free' : 'price-tag'}">${formatPrice(item.price)}</span>
          <span class="size-tag">${item.fileSize}</span>
        </div>
      </div>
    </div>
  `;
}

// ---- Homepage ----
async function renderHome() {
  if (heroInterval) {
    clearInterval(heroInterval);
    heroInterval = null;
  }
  currentPage = 'home';

  const [gamesRes, trendingGamesRes] = await Promise.all([
    fetch('/api/games?limit=100'),
    fetch('/api/games?sort=trending&limit=5')
  ]);

  const gamesData = await gamesRes.json();
  const trendingGamesData = await trendingGamesRes.json();

  const allGames = gamesData.games || [];
  const trendingGames = trendingGamesData.games || [];

  const allItems = allGames.map(g => ({ ...g, _type: 'game' }));
  allItemsCache = allItems;

  const totalItems = allItems.length;
  const totalDownloads = allItems.reduce((sum, i) => sum + (i.downloads || 0), 0);
  const globalRating = calculateGlobalRating(allItems);

  const trendingAll = trendingGames.map(g => ({ ...g, _type: 'game' }));
  trendingAll.sort((a, b) => ((b.clicks || 0) + (b.downloads || 0)) - ((a.clicks || 0) + (a.downloads || 0)));
  const topTrending = trendingAll.slice(0, 5);
  const recentItems = allItems.slice(0, 8);

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ apps · games</small>
      </div>
      <div class="header-stats">
        <span>📦 ${totalItems} items</span>
        <span>⬇️ ${totalDownloads} downloads</span>
        ${globalRating ? `<span>⭐ ${globalRating.percent}%</span>` : ''}
      </div>
    </div>
  `;

  html += `
    <div class="tabs main-nav">
      <button class="nav-btn active" data-nav="home">🏠 Home</button>
      <button class="nav-btn" data-nav="apps">🔧 Apps</button>
      <button class="nav-btn" data-nav="games">🎮 Games</button>
      <button class="nav-btn" data-nav="movies">🎬 Movies</button>
      <div class="search-wrapper">
        <input type="text" id="globalSearchInput" placeholder="Search all..." autocomplete="off" />
        <button id="globalSearchBtn">🔍</button>
      </div>
      <button class="cart-btn" data-nav="cart">
        🛒 Cart <span class="cart-badge" id="cartBadge">${cart.items ? cart.items.length : 0}</span>
      </button>
    </div>
  `;

  html += `
    <div class="home-hero">
      <div class="hero-text">
        <h1>Your central hub for apps and games</h1>
        <p>Discover, download, and enjoy hand‑picked content — all in one place.</p>
      </div>
      <div class="category-cards" style="grid-template-columns: repeat(3, 1fr);">
        <div class="category-card" data-nav="apps">
          <div class="cat-icon">🔧</div>
          <h3>Apps & Tools</h3>
          <p>${allGames.filter(g => g.tags.some(t => t.toLowerCase() === 'tool')).length} utilities</p>
        </div>
        <div class="category-card" data-nav="games">
          <div class="cat-icon">🎮</div>
          <h3>Games</h3>
          <p>${allGames.filter(g => !g.tags.some(t => t.toLowerCase() === 'tool')).length} titles</p>
        </div>
        <div class="category-card" data-nav="movies">
          <div class="cat-icon">🎬</div>
          <h3>Movies</h3>
          <p style="color:#c95f5f;">Discontinued</p>
        </div>
      </div>
    </div>
  `;

  if (topTrending.length > 0) {
    html += `
      <div class="section-header">
        <span>🔥 Trending Now</span>
      </div>
      <div class="game-scroll-wrapper">
        <div class="game-scroll-inner">
          ${topTrending.map(item => renderItemCard(item)).join('')}
        </div>
        <div class="scroll-slider">
          <div class="scroll-track"><div class="scroll-thumb"></div></div>
        </div>
      </div>
    `;
  }

  if (recentItems.length > 0) {
    html += `
      <div class="section-header">
        <span>🆕 Recent Additions</span>
      </div>
      <div class="game-grid">
        ${recentItems.map(item => renderItemCard(item)).join('')}
      </div>
    `;
  }

  html += `
    <div class="home-footer">
      <button class="footer-btn support-btn" id="supportBtn">💖 Support</button>
      <button class="footer-btn request-btn" id="requestGameBtn">📝 Request</button>
      <button class="footer-btn devlog-btn" id="devlogBtn">📜 Devlog</button>
    </div>
  `;

  app.innerHTML = html;

  attachEventListeners();
  updateCartCount();
  initScrollSliders();

  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) setupGlobalAutocomplete(searchInput);

  showSecurityPopup();
}

// ---- Category Pages (apps, games only) ----
async function renderCategory(category, params = {}) {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }

  // Redirect movies to discontinued page
  if (category === 'movies') {
    renderMoviesDiscontinued();
    return;
  }

  currentPage = category;
  if (params.sort) currentSort = params.sort;
  if (params.search !== undefined) currentSearch = params.search;
  currentPageNum = params.page || 1;
  currentLimit = params.limit || 20;

  let endpoint = '/api/games';
  let typeFilter = null;
  let categoryLabel = '';
  if (category === 'apps') {
    typeFilter = 'tools';
    categoryLabel = 'Apps & Tools';
  } else if (category === 'games') {
    typeFilter = 'games';
    categoryLabel = 'Games';
  }

  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('sort', currentSort);
  url.searchParams.set('page', currentPageNum);
  url.searchParams.set('limit', currentLimit);
  if (typeFilter) url.searchParams.set('type', typeFilter);
  if (currentSearch) url.searchParams.set('search', currentSearch);

  const res = await fetch(url);
  const data = await res.json();
  const items = data.games || [];
  const typedItems = items.map(item => ({ ...item, _type: 'game' }));
  allItemsCache = typedItems;

  const globalRating = calculateGlobalRating(typedItems);

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ ${categoryLabel}</small>
      </div>
      <div class="header-stats">
        <span>📦 ${data.total} items</span>
        ${globalRating ? `<span>⭐ ${globalRating.percent}%</span>` : ''}
      </div>
    </div>
  `;

  html += `
    <div class="tabs main-nav">
      <button class="nav-btn" data-nav="home">🏠 Home</button>
      <button class="nav-btn ${category === 'apps' ? 'active' : ''}" data-nav="apps">🔧 Apps</button>
      <button class="nav-btn ${category === 'games' ? 'active' : ''}" data-nav="games">🎮 Games</button>
      <button class="nav-btn" data-nav="movies">🎬 Movies</button>
      <div class="search-wrapper category-search">
        <input type="text" id="categorySearchInput" placeholder="Search ${categoryLabel}..." value="${currentSearch}" autocomplete="off" />
        <button id="categorySearchBtn">🔍</button>
      </div>
      <button class="cart-btn" data-nav="cart">
        🛒 Cart <span class="cart-badge" id="cartBadge">${cart.items ? cart.items.length : 0}</span>
      </button>
    </div>
  `;

  const sorts = ['newest', 'trending', 'popular'];
  const sortLabels = { newest: '🆕 Newest', trending: '🔥 Trending', popular: '⭐ Popular' };
  html += `
    <div class="category-sort-tabs">
      ${sorts.map(s => `<button class="sort-tab ${currentSort === s ? 'active' : ''}" data-sort="${s}">${sortLabels[s]}</button>`).join('')}
      <span style="margin-left:auto;color:#9a887a;font-size:0.9rem;">${data.total} items</span>
    </div>
  `;

  if (typedItems.length === 0) {
    html += `<p style="color:#9a887a;padding:30px 0;text-align:center;font-size:1.2rem;">😢 No items found.</p>`;
  } else {
    html += `<div class="game-grid">${typedItems.map(item => renderItemCard(item)).join('')}</div>`;
  }

  html += `
    <div class="pagination">
      <button ${data.page <= 1 ? 'disabled style="opacity:0.4"' : ''} id="prevPage">← Prev</button>
      <span>Page ${data.page} of ${data.totalPages || 1}</span>
      <button ${data.page >= data.totalPages ? 'disabled style="opacity:0.4"' : ''} id="nextPage">Next →</button>
      <span style="margin-left:16px;">Per page:</span>
      <select id="limitSelect">
        <option value="20" ${currentLimit === 20 ? 'selected' : ''}>20</option>
        <option value="10" ${currentLimit === 10 ? 'selected' : ''}>10</option>
        <option value="30" ${currentLimit === 30 ? 'selected' : ''}>30</option>
      </select>
    </div>
  `;

  app.innerHTML = html;

  attachEventListeners();
  updateCartCount();

  const catSearchInput = document.getElementById('categorySearchInput');
  if (catSearchInput) setupCategoryAutocomplete(catSearchInput, typedItems);

  document.getElementById('prevPage')?.addEventListener('click', () => {
    if (data.page > 1) renderCategory(category, { ...params, page: data.page - 1 });
  });
  document.getElementById('nextPage')?.addEventListener('click', () => {
    if (data.page < data.totalPages) renderCategory(category, { ...params, page: data.page + 1 });
  });
  document.getElementById('limitSelect')?.addEventListener('change', (e) => {
    renderCategory(category, { ...params, page: 1, limit: parseInt(e.target.value) });
  });

  document.querySelectorAll('.sort-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const sort = btn.dataset.sort;
      renderCategory(category, { ...params, sort, page: 1 });
    });
  });

  const globalSearchInput = document.getElementById('globalSearchInput');
  if (globalSearchInput) setupGlobalAutocomplete(globalSearchInput);

  showSecurityPopup();
}

// ---- MOVIES DISCONTINUED PAGE ----
function renderMoviesDiscontinued() {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  currentPage = 'movies';

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ movies</small>
      </div>
    </div>

    <div class="tabs main-nav">
      <button class="nav-btn" data-nav="home">🏠 Home</button>
      <button class="nav-btn" data-nav="apps">🔧 Apps</button>
      <button class="nav-btn" data-nav="games">🎮 Games</button>
      <button class="nav-btn active" data-nav="movies">🎬 Movies</button>
      <div class="search-wrapper">
        <input type="text" id="globalSearchInput" placeholder="Search all..." autocomplete="off" />
        <button id="globalSearchBtn">🔍</button>
      </div>
      <button class="cart-btn" data-nav="cart">
        🛒 Cart <span class="cart-badge" id="cartBadge">${cart.items ? cart.items.length : 0}</span>
      </button>
    </div>

    <div class="discontinued-container">
      <div class="discontinued-icon">🎬</div>
      <h1>Movies Are Discontinued</h1>
      <p class="discontinued-message">
        We've decided to stop hosting movies on Melozzy Hub. 
        But don't worry — you can still watch <strong>free movies & TV shows</strong> at:
      </p>

      <a href="https://nxsha.app" target="_blank" rel="noopener" class="nxsha-link">
        <span class="nxsha-icon">🚀</span>
        <span class="nxsha-text">Go to nxsha.app</span>
        <span class="nxsha-arrow">→</span>
      </a>

      <div class="discontinued-warning">
        <div class="warning-icon">🛡️</div>
        <h2>Before You Go</h2>
        <p>
          nxsha.app and similar sites may show <strong>malicious ads, pop-ups, or unwanted content</strong>.
          For your safety, make sure you have an ad blocker installed.
        </p>
        <p style="font-size:0.85rem;color:#9a887a;">
          (If you already have one, you can ignore this.)
        </p>
      </div>

      <div class="security-buttons" style="max-width:400px;margin:20px auto 0;">
        <a href="https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh" 
           target="_blank" rel="noopener" class="security-btn chrome">
          <span class="btn-icon">🌐</span> Get for Chrome
        </a>
        <a href="https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak" 
           target="_blank" rel="noopener" class="security-btn edge">
          <span class="btn-icon">🌐</span> Get for Edge
        </a>
        <a href="https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/" 
           target="_blank" rel="noopener" class="security-btn firefox">
          <span class="btn-icon">🦊</span> Get for Firefox
        </a>
      </div>
    </div>
  `;

  app.innerHTML = html;

  attachEventListeners();
  updateCartCount();

  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) setupGlobalAutocomplete(searchInput);

  showSecurityPopup();
}

// ---- Search Results ----
async function renderSearchResults(query) {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  currentPage = 'search';
  currentSearch = query;

  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  const results = (data.results || []).filter(item => item._type !== 'movie');

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ search results</small>
      </div>
      <div class="header-stats">
        <span>🔍 "${query}"</span>
        <span>${results.length} results</span>
      </div>
    </div>
  `;

  html += `
    <div class="tabs main-nav">
      <button class="nav-btn" data-nav="home">🏠 Home</button>
      <button class="nav-btn" data-nav="apps">🔧 Apps</button>
      <button class="nav-btn" data-nav="games">🎮 Games</button>
      <button class="nav-btn" data-nav="movies">🎬 Movies</button>
      <div class="search-wrapper">
        <input type="text" id="globalSearchInput" placeholder="Search all..." value="${query}" autocomplete="off" />
        <button id="globalSearchBtn">🔍</button>
      </div>
      <button class="cart-btn" data-nav="cart">
        🛒 Cart <span class="cart-badge" id="cartBadge">${cart.items ? cart.items.length : 0}</span>
      </button>
    </div>
  `;

  if (results.length === 0) {
    html += `<p style="color:#9a887a;padding:30px 0;text-align:center;font-size:1.2rem;">😢 No items match your search.</p>`;
  } else {
    html += `<div class="game-grid">${results.map(item => renderItemCard(item)).join('')}</div>`;
  }

  app.innerHTML = html;
  attachEventListeners();
  updateCartCount();

  const searchInput = document.getElementById('globalSearchInput');
  if (searchInput) setupGlobalAutocomplete(searchInput);

  showSecurityPopup();
}

// ---- Detail Page (games/apps only) ----
async function renderDetail(itemId, itemType, fromPage = 'home', fromParams = {}) {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  removeQuickView();
  currentPage = 'detail';
  currentItemId = itemId;

  try {
    const res = await fetch(`/api/item/${itemId}`);
    if (!res.ok) throw new Error('Not found');
    const item = await res.json();
    const type = item._type || itemType || 'game';

    // Redirect movies to discontinued page
    if (type === 'movie') {
      renderMoviesDiscontinued();
      return;
    }

    await fetch(`/api/item/${itemId}/click`, { method: 'POST' });

    const imgSrc = `/games/${item.id}/${item.screenshot}`;
    const isFree = item.price === 0;
    const isRip = item.tags.some(t => t.toLowerCase() === 'rip');

    let detailContent = `
      <div class="detail-container">
        <button class="back-btn" id="backBtn">← Back</button>
        <h1>${item.name} ${isRip ? '🪦' : ''}</h1>
        ${isRip ? `<div class="rip-disclaimer"><span>⚠️ Disclaimer:</span> This item is marked as RIP (No longer maintained, removed, or discontinued).</div>` : ''}
        <img src="${imgSrc}" alt="${item.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22800%22 height=%22450%22%3E%3Crect fill=%22%231A1512%22 width=%22800%22 height=%22450%22/%3E%3Ctext x=%22400%22 y=%22225%22 text-anchor=%22middle%22 fill=%22%236B5A4A%22 font-family=%22sans-serif%22 font-size=%2224%22%3E🎮 No Image%3C/text%3E%3C/svg%3E'" />
        <div class="price-big ${isFree ? 'free' : ''}">${formatPrice(item.price)}</div>
        <div class="desc-wrapper" id="descWrapper">
          <div class="desc-big">${item.description}</div>
          <div class="desc-fade"></div>
        </div>
        <button class="read-more-btn" id="readMoreBtn">Read More</button>
        <div class="tags">
          ${item.tags.map(t => `<span data-tag="${t}">#${t}</span>`).join('')}
        </div>
        <div class="stats">
          <span>📦 ${item.fileSize}</span>
          <span>📅 ${formatDate(item.releaseDate)}</span>
          <span>⬇️ ${item.downloads || 0}</span>
          <span>👆 ${item.clicks || 0}</span>
          ${item.totalVotes ? `<span>⭐ ${Math.round((item.totalStars/item.totalVotes/5)*100)}% (${item.totalVotes})</span>` : ''}
          <span class="item-type-badge-detail">${item.tags.some(t => t.toLowerCase() === 'tool') ? '🔧 App' : '🎮 Game'}</span>
        </div>
    `;

    // ---- Action buttons ----
    let actionsHtml = '';
    if (isFree) {
      actionsHtml += `<button class="download-btn" id="downloadBtn">⬇️ Download Now</button>`;
    } else {
      actionsHtml += `<button class="add-to-cart-btn" id="addToCartBtn">🛒 Add to Cart (${formatPrice(item.price)})</button>`;
    }
    detailContent += `<div class="detail-actions">${actionsHtml}</div>`;

    detailContent += `</div>`;

    const fullHtml = renderAdLayout(detailContent, allItemsCache);
    app.innerHTML = fullHtml;

    // ---- Event Listeners ----
    document.getElementById('backBtn').addEventListener('click', () => {
      if (fromPage === 'home') navigateTo('home');
      else if (fromPage === 'apps') navigateTo('apps', fromParams);
      else if (fromPage === 'games') navigateTo('games', fromParams);
      else if (fromPage === 'devlog') navigateTo('devlog');
      else history.back();
    });

    document.querySelectorAll('.tags span').forEach(el => {
      el.addEventListener('click', () => {
        navigateTo('home');
      });
    });

    document.querySelectorAll('.game-ad-banner').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        if (id) {
          const cached = allItemsCache.find(i => i.id === id);
          if (cached) {
            renderDetail(id, cached._type, currentPage, {
              sort: currentSort,
              search: currentSearch,
              page: currentPageNum,
              limit: currentLimit
            });
          }
        }
      });
    });

    const descWrapper = document.getElementById('descWrapper');
    const readMoreBtn = document.getElementById('readMoreBtn');
    if (descWrapper && readMoreBtn) {
      const descHeight = descWrapper.scrollHeight;
      const isLong = descHeight > 200;
      if (!isLong) {
        readMoreBtn.style.display = 'none';
        descWrapper.style.maxHeight = 'none';
        const fade = descWrapper.querySelector('.desc-fade');
        if (fade) fade.style.opacity = '0';
      } else {
        readMoreBtn.addEventListener('click', () => {
          const isExpanded = descWrapper.classList.contains('expanded');
          if (isExpanded) {
            descWrapper.classList.remove('expanded');
            readMoreBtn.textContent = 'Read More';
          } else {
            descWrapper.classList.add('expanded');
            readMoreBtn.textContent = 'Read Less';
          }
        });
      }
    }

    if (isFree) {
      document.getElementById('downloadBtn')?.addEventListener('click', () => {
        if (isRip) {
          if (!confirm('⚠️ This item is from an unofficial or discontinued source.\n\nAre you sure you want to download it?')) {
            return;
          }
        }
        const downloadEndpoint = `/api/games/${item.id}/download`;
        const downloadLink = document.createElement('a');
        downloadLink.href = downloadEndpoint;
        downloadLink.download = `${item.id}.zip`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        setTimeout(() => {
          showRatingModal(item.id, (rated) => {
            setTimeout(() => {
              if (currentPage === 'detail') {
                renderDetail(itemId, type, fromPage, fromParams);
              } else {
                navigateTo('home');
              }
            }, 500);
          });
        }, 400);
      });
    } else {
      document.getElementById('addToCartBtn')?.addEventListener('click', () => {
        addToCart({ ...item, _type: type });
      });
    }

    history.pushState({ page: 'detail', id: itemId, type, from: fromPage, params: fromParams }, '', `/${type}/${itemId}`);
  } catch (err) {
    app.innerHTML = `<p style="color:#c95f5f;font-size:1.4rem;text-align:center;padding:40px;">😵 Item not found! <button id="goHome" style="background:#d48f5a;color:#1e1713;border:none;padding:10px 24px;border-radius:30px;font-weight:700;cursor:pointer;margin-left:12px;">Go home</button></p>`;
    document.getElementById('goHome')?.addEventListener('click', () => navigateTo('home'));
  }

  showSecurityPopup();
}

// ---- Ads Layout ----
function renderAdLayout(contentHtml, itemsList) {
  const randomItems = getRandomItems(itemsList, 8);
  if (randomItems.length === 0) return contentHtml;

  const leftItems = randomItems.slice(0, 4);
  const rightItems = randomItems.slice(4, 8);

  const leftAds = leftItems.map(g => renderGameAd(g)).join('');
  const rightAds = rightItems.map(g => renderGameAd(g)).join('');

  return `
    <div class="content-with-ads">
      <div class="ad-slot ad-slot-left">
        ${leftAds}
      </div>
      <div class="content-main">
        ${contentHtml}
      </div>
      <div class="ad-slot ad-slot-right">
        ${rightAds}
      </div>
    </div>
  `;
}

function getRandomItems(items, count) {
  if (!items || items.length === 0) return [];
  let shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  while (shuffled.length < count) {
    const shuffledCopy = [...items].sort(() => 0.5 - Math.random());
    shuffled = shuffled.concat(shuffledCopy);
  }
  return shuffled.slice(0, count);
}

function renderGameAd(item) {
  const imgSrc = `/games/${item.id}/${item.screenshot}`;
  const isFree = item.price === 0;

  return `
    <div class="ad-banner game-ad-banner" data-id="${item.id}">
      <div class="ad-img-placeholder" style="background-image: url('${imgSrc}');">
        <img src="${imgSrc}" alt="${item.name}" style="display:none;" onerror="this.parentElement.style.backgroundImage='none'; this.parentElement.textContent='🎮'; this.parentElement.style.fontSize='2.2rem';" />
        <div class="item-type-badge" style="position:absolute;bottom:6px;right:6px;background:rgba(0,0,0,0.6);color:#fff;font-size:0.4rem;padding:2px 6px;border-radius:8px;">🎮</div>
      </div>
      <div class="ad-info">
        <div class="ad-title">${item.name}</div>
        <div class="ad-sub">
          <span class="ad-price ${isFree ? 'free' : ''}">${formatPrice(item.price)}</span>
          <span>•</span>
          <span>${item.fileSize}</span>
        </div>
        <span class="ad-btn">View</span>
      </div>
    </div>
  `;
}

// ---- Autocomplete ----
function setupGlobalAutocomplete(input) {
  const wrapper = input.closest('.search-wrapper');
  if (!wrapper) return;
  const existing = wrapper.querySelector('.autocomplete-list');
  if (existing) existing.remove();

  const list = document.createElement('div');
  list.className = 'autocomplete-list';
  list.id = 'autocompleteList';
  wrapper.appendChild(list);

  let currentFocus = -1;

  input.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    if (query.length < 1) {
      list.classList.remove('show');
      currentFocus = -1;
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const matches = (data.results || []).filter(item => item._type !== 'movie').slice(0, 8);

      if (matches.length === 0) {
        list.innerHTML = `<div class="autocomplete-item" style="color:#9a887a;cursor:default;justify-content:center;">No results</div>`;
        list.classList.add('show');
        return;
      }

      list.innerHTML = matches.map((item, i) => `
        <div class="autocomplete-item" data-id="${item.id}" data-type="${item._type}" data-index="${i}">
          <span class="ac-name">${item.name}</span>
          <span class="ac-tag">🎮 ${item.tags.some(t => t.toLowerCase() === 'tool') ? 'App' : 'Game'}</span>
          <span class="ac-type">${formatPrice(item.price)}</span>
        </div>
      `).join('');
      list.classList.add('show');
      currentFocus = -1;

      list.querySelectorAll('.autocomplete-item').forEach(itemEl => {
        itemEl.addEventListener('click', () => {
          const id = itemEl.dataset.id;
          const type = itemEl.dataset.type;
          if (id && type) {
            input.value = '';
            list.classList.remove('show');
            renderDetail(id, type, currentPage, {
              sort: currentSort,
              search: currentSearch,
              page: currentPageNum,
              limit: currentLimit
            });
          }
        });
      });
    } catch (err) {
      // fallback
    }
  });

  input.addEventListener('keydown', (e) => {
    const items = list.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentFocus = (currentFocus + 1) % items.length;
      items.forEach((item, i) => {
        item.style.background = i === currentFocus ? 'rgba(255,215,180,0.04)' : '';
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentFocus = (currentFocus - 1 + items.length) % items.length;
      items.forEach((item, i) => {
        item.style.background = i === currentFocus ? 'rgba(255,215,180,0.04)' : '';
      });
    } else if (e.key === 'Enter' && currentFocus >= 0) {
      e.preventDefault();
      const item = items[currentFocus];
      if (item) {
        const id = item.dataset.id;
        const type = item.dataset.type;
        if (id && type) {
          input.value = '';
          list.classList.remove('show');
          renderDetail(id, type, currentPage, {
            sort: currentSort,
            search: currentSearch,
            page: currentPageNum,
            limit: currentLimit
          });
        }
      }
    } else if (e.key === 'Escape') {
      list.classList.remove('show');
      input.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      list.classList.remove('show');
    }
  });
}

function setupCategoryAutocomplete(input, items) {
  const wrapper = input.closest('.search-wrapper');
  if (!wrapper) return;
  const existing = wrapper.querySelector('.autocomplete-list');
  if (existing) existing.remove();

  const list = document.createElement('div');
  list.className = 'autocomplete-list';
  list.id = 'autocompleteList';
  wrapper.appendChild(list);
  let currentFocus = -1;

  input.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query || query.length < 1) {
      list.classList.remove('show');
      currentFocus = -1;
      return;
    }
    const matches = items.filter(i => i.name.toLowerCase().includes(query)).slice(0, 8);
    if (matches.length === 0) {
      list.innerHTML = `<div class="autocomplete-item" style="color:#9a887a;cursor:default;justify-content:center;">No results</div>`;
      list.classList.add('show');
      return;
    }
    list.innerHTML = matches.map((item, i) => `
      <div class="autocomplete-item" data-id="${item.id}" data-type="${item._type}" data-index="${i}">
        <span class="ac-name">${item.name}</span>
        <span class="ac-type">${formatPrice(item.price)}</span>
      </div>
    `).join('');
    list.classList.add('show');
    currentFocus = -1;

    list.querySelectorAll('.autocomplete-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const type = el.dataset.type;
        if (id && type) {
          input.value = '';
          list.classList.remove('show');
          renderDetail(id, type, currentPage, {
            sort: currentSort,
            search: currentSearch,
            page: currentPageNum,
            limit: currentLimit
          });
        }
      });
    });
  });

  input.addEventListener('keydown', (e) => {
    const itemsList = list.querySelectorAll('.autocomplete-item');
    if (itemsList.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentFocus = (currentFocus + 1) % itemsList.length;
      itemsList.forEach((item, i) => {
        item.style.background = i === currentFocus ? 'rgba(255,215,180,0.04)' : '';
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentFocus = (currentFocus - 1 + itemsList.length) % itemsList.length;
      itemsList.forEach((item, i) => {
        item.style.background = i === currentFocus ? 'rgba(255,215,180,0.04)' : '';
      });
    } else if (e.key === 'Enter' && currentFocus >= 0) {
      e.preventDefault();
      const item = itemsList[currentFocus];
      if (item) {
        const id = item.dataset.id;
        const type = item.dataset.type;
        if (id && type) {
          input.value = '';
          list.classList.remove('show');
          renderDetail(id, type, currentPage, {
            sort: currentSort,
            search: currentSearch,
            page: currentPageNum,
            limit: currentLimit
          });
        }
      }
    } else if (e.key === 'Escape') {
      list.classList.remove('show');
      input.blur();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      list.classList.remove('show');
    }
  });
}

// ==========================================
// RATING MODAL
// ==========================================
function showRatingModal(itemId, onComplete) {
  const existing = document.querySelector('.rating-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'rating-overlay';
  let selectedStars = 0;

  overlay.innerHTML = `
    <div class="rating-modal">
      <h2>⭐ Enjoy the item?</h2>
      <p>Rate your experience (1-5 stars)</p>
      <div class="star-rating" id="starContainer">
        ${[1, 2, 3, 4, 5].map(i => `<span class="star" data-value="${i}">☆</span>`).join('')}
      </div>
      <div class="rating-actions">
        <button class="submit-rating-btn" id="submitRatingBtn">Submit & Close</button>
        <button class="skip-rating-btn" id="rateLaterBtn">Rate Later</button>
        <button class="skip-rating-btn" id="skipRatingBtn">Skip</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const stars = overlay.querySelectorAll('.star');
  const submitBtn = overlay.querySelector('#submitRatingBtn');
  const skipBtn = overlay.querySelector('#skipRatingBtn');
  const rateLaterBtn = overlay.querySelector('#rateLaterBtn');

  stars.forEach(star => {
    star.addEventListener('mouseenter', () => {
      const val = parseInt(star.dataset.value);
      stars.forEach(s => {
        const sv = parseInt(s.dataset.value);
        s.textContent = sv <= val ? '★' : '☆';
        s.classList.toggle('active', sv <= val);
      });
    });
    star.addEventListener('click', () => {
      selectedStars = parseInt(star.dataset.value);
      stars.forEach(s => {
        const sv = parseInt(s.dataset.value);
        s.textContent = sv <= selectedStars ? '★' : '☆';
        s.classList.toggle('active', sv <= selectedStars);
      });
    });
    star.addEventListener('mouseleave', () => {
      stars.forEach(s => {
        const sv = parseInt(s.dataset.value);
        if (selectedStars > 0) {
          s.textContent = sv <= selectedStars ? '★' : '☆';
          s.classList.toggle('active', sv <= selectedStars);
        } else {
          s.textContent = '☆';
          s.classList.remove('active');
        }
      });
    });
  });

  const doAction = async (submit) => {
    let rated = false;
    if (submit && selectedStars > 0) {
      const result = await fetch(`/api/item/${itemId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars: selectedStars })
      });
      const data = await result.json();
      if (data.alreadyRated) {
        alert('You already rated this item from this device!');
      } else if (data.success) {
        rated = true;
        alert('Thanks for rating! ⭐');
      }
    }
    overlay.remove();
    if (onComplete) onComplete(rated);
  };

  submitBtn.addEventListener('click', () => doAction(true));
  skipBtn.addEventListener('click', () => doAction(false));
  rateLaterBtn.addEventListener('click', () => {
    overlay.remove();
    if (onComplete) onComplete(false);
  });
}

// ==========================================
// QUICK VIEW
// ==========================================
function showQuickView(item, element) {
  removeQuickView();

  const rect = element.getBoundingClientRect();
  const imgSrc = `/games/${item.id}/${item.screenshot}`;
  const isFree = item.price === 0;

  const popup = document.createElement('div');
  popup.className = 'quick-view-popup';
  popup.id = 'quickViewPopup';
  popup.innerHTML = `
    <div class="qv-thumb">
      <img src="${imgSrc}" alt="${item.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2272%22 height=%2272%22%3E%3Crect fill=%22%231A1512%22 width=%2272%22 height=%2272%22/%3E%3Ctext x=%2236%22 y=%2238%22 text-anchor=%22middle%22 fill=%22%236B5A4A%22 font-family=%22sans-serif%22 font-size=%2210%22%3E🎮%3C/text%3E%3C/svg%3E'" />
      <div class="qv-info">
        <div class="qv-name">${item.name}</div>
        <div class="qv-price ${isFree ? 'free' : ''}">${formatPrice(item.price)}</div>
        <div class="qv-tags">
          ${item.tags.slice(0, 3).map(t => `<span>#${t}</span>`).join('')}
          ${item.tags.length > 3 ? `<span>+${item.tags.length - 3}</span>` : ''}
        </div>
        <div class="qv-size">📦 ${item.fileSize}</div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  const popupWidth = 300;
  const popupHeight = 120;

  let left = rect.right + 12;
  let top = rect.top + (rect.height / 2) - (popupHeight / 2);

  if (left + popupWidth > window.innerWidth - 20) {
    left = rect.left - popupWidth - 12;
  }

  if (top + popupHeight > window.innerHeight - 20) {
    top = window.innerHeight - popupHeight - 20;
  }
  if (top < 20) top = 20;

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';

  requestAnimationFrame(() => {
    popup.classList.add('show');
  });

  quickViewActive = true;
}

function removeQuickView() {
  if (quickViewShowTimer) {
    clearTimeout(quickViewShowTimer);
    quickViewShowTimer = null;
  }
  if (quickViewHideTimer) {
    clearTimeout(quickViewHideTimer);
    quickViewHideTimer = null;
  }

  const popup = document.getElementById('quickViewPopup');
  if (popup) {
    popup.classList.remove('show');
    setTimeout(() => {
      if (popup.parentNode) popup.remove();
    }, 200);
  }
  quickViewActive = false;
}

// ==========================================
// CART PAGE
// ==========================================
function renderCart() {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  currentPage = 'cart';
  const items = cart.items || [];
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const promo = cart.promo;
  let discountAmount = 0;
  if (promo) {
    discountAmount = (subtotal * promo.discount) / 100;
  }
  const total = subtotal - discountAmount;

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ cart</small>
      </div>
    </div>
    <div style="margin: 20px 0;">
      <button class="back-btn" id="backFromCart">← Back</button>
    </div>
    <div class="cart-container">
      <h1>🛒 Your Cart</h1>
  `;

  if (items.length === 0) {
    html += `<p class="empty-cart">Your cart is empty. Go find something! 🎮</p>`;
  } else {
    items.forEach(item => {
      html += `
        <div class="cart-item">
          <div class="item-info">
            <span class="item-name">${item.name} <span style="font-size:0.6rem;color:#9a887a;">(${item._type || 'game'})</span></span>
            <span class="item-price">${formatPrice(item.price)}</span>
          </div>
          <button class="remove-btn" data-id="${item.id}">Remove</button>
        </div>
      `;
    });

    html += `
      <div class="promo-section">
        <div class="promo-input-group">
          <input type="text" id="promoInput" placeholder="Enter promo code..." maxlength="20" />
          <button id="applyPromoBtn">Apply</button>
        </div>
        <div id="promoStatus">
          ${promo ? `<span class="promo-success">✅ ${promo.code} (${promo.discount}% off) <button class="promo-remove" id="removePromoBtn">✕</button></span>` : ''}
        </div>
      </div>
    `;

    html += `
      <div class="cart-totals">
        <div class="cart-subtotal">Subtotal: ${formatPrice(subtotal)}</div>
        ${promo ? `<div class="cart-discount">Discount (${promo.discount}%): -${formatPrice(discountAmount)}</div>` : ''}
        <div class="cart-total ${total === 0 ? 'free' : ''}">Total: ${formatPrice(total)}</div>
      </div>
      ${total === 0 
        ? `<button class="checkout-btn free-checkout" id="checkoutBtn">🎁 Free Download</button>` 
        : `<button class="checkout-btn" id="checkoutBtn">💳 Checkout & Pay</button>`
      }
    `;
  }

  html += `</div>`;
  app.innerHTML = html;

  document.getElementById('backFromCart')?.addEventListener('click', () => history.back());

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(btn.dataset.id));
  });

  document.getElementById('applyPromoBtn')?.addEventListener('click', () => {
    const input = document.getElementById('promoInput');
    const code = input.value.trim();
    if (!code) {
      alert('Please enter a promo code.');
      return;
    }
    applyPromoCode(code);
  });

  document.getElementById('promoInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('applyPromoBtn')?.click();
    }
  });

  document.getElementById('removePromoBtn')?.addEventListener('click', removePromo);

  document.getElementById('checkoutBtn')?.addEventListener('click', async () => {
    const total = getCartTotal();
    if (total === 0) {
      const itemIds = cart.items.map(item => item.id);
      const items = cart.items;
      try {
        const res = await fetch('/api/init-free-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemIds })
        });
        const data = await res.json();
        if (res.ok) {
          cart.items = [];
          cart.promo = null;
          saveCart();
          updateCartCount();
          window._freeItems = items;
          navigateTo('free-download', { token: data.token, items });
        } else {
          alert('❌ ' + data.error);
        }
      } catch (err) {
        alert('❌ Something went wrong. Please try again.');
      }
    } else {
      alert(`❌ UNAVAILABLE - Payment processing is not enabled yet.\n\nTotal due: ${formatPrice(total)}`);
    }
  });

  updateCartCount();

  showSecurityPopup();
}

// ==========================================
// FREE DOWNLOAD PAGE
// ==========================================
function renderFreeDownload(token) {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  currentPage = 'free-download';
  const items = window._freeItems || [];
  if (!token || items.length === 0) {
    navigateTo('home');
    return;
  }

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ free download</small>
      </div>
    </div>
    <div style="margin: 20px 0;">
      <button class="back-btn" id="backFromFree">← Back</button>
    </div>
    <div class="cart-container" style="text-align:center;">
      <h1>🎉 Your Download is Ready!</h1>
      <p style="color:#aad4b0;font-size:1.2rem;margin:8px 0;">You got this for FREE!</p>
      
      <div style="margin:24px 0;text-align:left;border-top:1px solid rgba(255,215,180,0.04);padding-top:20px;">
        <p style="color:#f0e6dc;font-weight:600;margin-bottom:12px;">📦 Your Items:</p>
        ${items.map(item => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,215,180,0.02);">
            <span style="color:#f0e6dc;">${item.name} <span style="font-size:0.6rem;color:#9a887a;">(${item._type || 'game'})</span></span>
            <span style="color:#aad4b0;">FREE</span>
          </div>
        `).join('')}
      </div>
      
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:20px;">
        ${items.map(item => `
          <a href="/api/download-free/${item.id}?token=${token}" class="free-download-link">
            ⬇️ Download ${item.name}
          </a>
        `).join('')}
      </div>
      
      <p style="color:#c95f5f;font-size:0.85rem;margin-top:16px;font-weight:600;">
        ⚠️ These download links expire in 10 seconds or after first use!
      </p>
      
      <button id="goHomeAfterFree" style="margin-top:16px;background:linear-gradient(145deg,#d48f5a,#b87a4d);border:none;color:#1e1713;padding:12px 28px;border-radius:30px;cursor:pointer;transition:0.3s;font-weight:700;font-family:'Inter',sans-serif;">
        🏠 Return Home
      </button>
    </div>
  `;

  app.innerHTML = html;

  document.getElementById('backFromFree')?.addEventListener('click', () => history.back());
  document.getElementById('goHomeAfterFree')?.addEventListener('click', () => navigateTo('home'));

  updateCartCount();

  showSecurityPopup();
}

// ==========================================
// DEVLOG
// ==========================================
async function renderDevlog() {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  currentPage = 'devlog';
  const res = await fetch('/api/devlog');
  const data = await res.json();
  const entries = data.entries || [];

  let html = `
    <div class="home-header">
      <div class="brand" data-nav="home">
        Melozzy Hub
        <small>✦ devlog</small>
      </div>
    </div>
    <div style="margin: 20px 0;">
      <button class="back-btn" id="backFromDevlog">← Back</button>
    </div>
    <div class="devlog-container">
      <h1 style="font-family:'Patrick Hand',cursive;font-size:2.5rem;color:#f0e6dc;margin-bottom:20px;">📜 Devlog</h1>
  `;

  if (entries.length === 0) {
    html += `<p style="color:#9a887a;text-align:center;padding:40px 0;">No devlog entries yet.</p>`;
  } else {
    entries.forEach(entry => {
      const dateObj = new Date(entry.date + 'T00:00:00');
      const formattedDate = dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      html += `
        <div class="devlog-entry">
          <div class="devlog-date">${formattedDate}</div>
          <div class="devlog-message">${entry.message}</div>
        </div>
      `;
    });
  }

  html += `</div>`;
  app.innerHTML = html;

  document.getElementById('backFromDevlog')?.addEventListener('click', () => history.back());
  updateCartCount();

  showSecurityPopup();
}

// ==========================================
// SECURITY WARNING POPUP
// ==========================================
function showSecurityPopup() {
  if (securityPopupShown) return;

  const overlay = document.createElement('div');
  overlay.id = 'securityPopupOverlay';
  overlay.className = 'security-popup-overlay';
  overlay.innerHTML = `
    <div class="security-popup">
      <div class="security-popup-header">
        <span class="security-icon">🛡️</span>
        <h2>Important Security Notice</h2>
      </div>
      <p>
        Some content on this site may use external sources that could display 
        <strong>malicious ads, pop-ups, or unwanted content</strong>.
      </p>
      <p>
        For your safety and a better viewing experience, we <strong>strongly recommend</strong> 
        installing a free ad blocker.
      </p>
      <div class="security-buttons">
        <a href="https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh" 
           target="_blank" rel="noopener" class="security-btn chrome">
          <span class="btn-icon">🌐</span> Get for Chrome
        </a>
        <a href="https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak" 
           target="_blank" rel="noopener" class="security-btn edge">
          <span class="btn-icon">🌐</span> Get for Edge
        </a>
        <a href="https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/" 
           target="_blank" rel="noopener" class="security-btn firefox">
          <span class="btn-icon">🦊</span> Get for Firefox
        </a>
      </div>
      <div style="text-align:center; margin-top:6px; color:#666; font-size:0.65rem; user-select:none; letter-spacing:0.3px;">
        mf i alr have one
      </div>
      <div class="security-timer">
        <span id="securityCountdown">3</span> seconds until you can close this notice...
      </div>
      <button class="security-close" id="securityCloseBtn" disabled>
        ✕ I understand, close this
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  let seconds = 3;
  const countdownEl = document.getElementById('securityCountdown');
  const closeBtn = document.getElementById('securityCloseBtn');

  const timer = setInterval(() => {
    seconds--;
    if (countdownEl) countdownEl.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(timer);
      closeBtn.disabled = false;
      closeBtn.textContent = '✕ I understand, close this';
      closeBtn.style.opacity = '1';
      closeBtn.style.cursor = 'pointer';
      const timerText = document.querySelector('.security-timer');
      if (timerText) timerText.textContent = 'You can now close this notice.';
    }
  }, 1000);

  closeBtn.addEventListener('click', () => {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.remove();
      securityPopupShown = true;
    }, 300);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && seconds <= 0) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
        securityPopupShown = true;
      }, 300);
    }
  });

  securityPopupShown = true;
}

// ==========================================
// NAVIGATION
// ==========================================
function navigateTo(page, params = {}) {
  if (page === 'home') {
    history.pushState({ page: 'home' }, '', '/');
    renderHome();
  } else if (page === 'apps') {
    history.pushState({ page: 'apps', ...params }, '', '/apps');
    renderCategory('apps', params);
  } else if (page === 'games') {
    history.pushState({ page: 'games', ...params }, '', '/games');
    renderCategory('games', params);
  } else if (page === 'movies') {
    history.pushState({ page: 'movies' }, '', '/movies');
    renderMoviesDiscontinued();
  } else if (page === 'cart') {
    history.pushState({ page: 'cart' }, '', '/cart');
    renderCart();
  } else if (page === 'devlog') {
    history.pushState({ page: 'devlog' }, '', '/devlog');
    renderDevlog();
  } else if (page === 'free-download') {
    window._freeItems = params.items || [];
    window._freeToken = params.token || null;
    history.pushState({ page: 'free-download', token: params.token, items: params.items }, '', '/free-download');
    renderFreeDownload(params.token);
  } else if (page === 'search') {
    history.pushState({ page: 'search', query: params.query }, '', `/search?q=${encodeURIComponent(params.query)}`);
    renderSearchResults(params.query);
  } else if (page === 'detail') {
    // handled in renderDetail
  }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function attachEventListeners() {
  document.querySelector('.brand')?.addEventListener('click', () => navigateTo('home'));

  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      const nav = el.dataset.nav;
      if (nav === 'home') navigateTo('home');
      else if (nav === 'apps') navigateTo('apps');
      else if (nav === 'games') navigateTo('games');
      else if (nav === 'movies') navigateTo('movies');
      else if (nav === 'cart') navigateTo('cart');
    });
  });

  const globalSearchBtn = document.getElementById('globalSearchBtn');
  const globalSearchInput = document.getElementById('globalSearchInput');
  if (globalSearchBtn && globalSearchInput) {
    const doSearch = () => {
      const query = globalSearchInput.value.trim();
      if (query) {
        navigateTo('search', { query });
      }
    };
    globalSearchBtn.addEventListener('click', doSearch);
    globalSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('.autocomplete-list')) {
        doSearch();
      }
    });
  }

  const catSearchBtn = document.getElementById('categorySearchBtn');
  const catSearchInput = document.getElementById('categorySearchInput');
  if (catSearchBtn && catSearchInput) {
    const doCatSearch = () => {
      const query = catSearchInput.value.trim();
      navigateTo(currentPage, { search: query, page: 1 });
    };
    catSearchBtn.addEventListener('click', doCatSearch);
    catSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.closest('.autocomplete-list')) {
        doCatSearch();
      }
    });
  }

  document.getElementById('supportBtn')?.addEventListener('click', () => {
    alert('💖 Support Melozzy Hub!\n\nYou can support me on Ko-fi, Patreon, or just share the site with your friends!\n\n(More options coming soon!)');
  });

  document.getElementById('requestGameBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.request-modal-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'request-modal-overlay';
    overlay.innerHTML = `
      <div class="request-modal">
        <h3>📝 Request a Game / App</h3>
        <p>What would you like to see added to Melozzy Hub?</p>
        <input type="text" id="gameRequestInput" placeholder="Enter name..." maxlength="100" autofocus />
        <div class="request-actions">
          <button class="submit-request-btn" id="submitRequestBtn">Submit Request</button>
          <button class="cancel-request-btn" id="cancelRequestBtn">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#gameRequestInput');
    const submitBtn = overlay.querySelector('#submitRequestBtn');
    const cancelBtn = overlay.querySelector('#cancelRequestBtn');

    setTimeout(() => input.focus(), 100);

    const submitRequest = async () => {
      const name = input.value.trim();
      if (!name) {
        alert('Please enter a name.');
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const res = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameName: name })
        });
        const data = await res.json();
        if (res.ok) {
          alert('✅ ' + data.message);
          overlay.remove();
        } else {
          alert('❌ ' + data.error);
        }
      } catch (err) {
        alert('❌ Something went wrong. Please try again.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Request';
      }
    };

    submitBtn.addEventListener('click', submitRequest);
    cancelBtn.addEventListener('click', () => overlay.remove());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitRequest();
      if (e.key === 'Escape') overlay.remove();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  });

  document.getElementById('devlogBtn')?.addEventListener('click', () => {
    navigateTo('devlog');
  });

  document.querySelectorAll('.game-card').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      const type = el.dataset.type;
      if (id && type) {
        removeQuickView();
        renderDetail(id, type, currentPage, {
          sort: currentSort,
          search: currentSearch,
          page: currentPageNum,
          limit: currentLimit
        });
      }
    });

    el.addEventListener('mouseenter', () => {
      if (quickViewHideTimer) clearTimeout(quickViewHideTimer);
      if (document.getElementById('quickViewPopup')) return;
      const itemData = el.dataset.item;
      if (itemData) {
        try {
          const item = JSON.parse(itemData);
          quickViewShowTimer = setTimeout(() => {
            showQuickView(item, el);
            quickViewShowTimer = null;
          }, 500);
        } catch (e) {
          const id = el.dataset.id;
          const type = el.dataset.type;
          const item = allItemsCache.find(i => i.id === id && i._type === type);
          if (item) {
            quickViewShowTimer = setTimeout(() => {
              showQuickView(item, el);
              quickViewShowTimer = null;
            }, 500);
          }
        }
      }
    });

    el.addEventListener('mouseleave', () => {
      if (quickViewShowTimer) {
        clearTimeout(quickViewShowTimer);
        quickViewShowTimer = null;
      }
      removeQuickView();
    });
  });

  document.querySelectorAll('.category-card').forEach(el => {
    el.addEventListener('click', () => {
      const nav = el.dataset.nav;
      if (nav) navigateTo(nav);
    });
  });
}

// ==========================================
// ROUTER (popstate)
// ==========================================
window.addEventListener('popstate', (e) => {
  if (window.__heroInterval) {
    clearInterval(window.__heroInterval);
    window.__heroInterval = null;
  }
  removeQuickView();
  const state = e.state;
  if (!state) { renderHome(); return; }
  if (state.page === 'home') renderHome();
  else if (state.page === 'cart') renderCart();
  else if (state.page === 'devlog') renderDevlog();
  else if (state.page === 'free-download') {
    renderFreeDownload(state.token);
  } else if (state.page === 'apps') {
    renderCategory('apps', state);
  } else if (state.page === 'games') {
    renderCategory('games', state);
  } else if (state.page === 'movies') {
    renderMoviesDiscontinued();
  } else if (state.page === 'search') {
    renderSearchResults(state.query);
  } else if (state.page === 'detail' && state.id && state.type) {
    renderDetail(state.id, state.type, state.from || 'home', state.params || {});
  }
});

// ==========================================
// INITIAL LOAD
// ==========================================
const path = window.location.pathname;
const searchParams = new URLSearchParams(window.location.search);
const cleanPath = path.replace(/\/$/, '');

if (cleanPath === '/') {
  renderHome();
} else if (cleanPath === '/cart') {
  renderCart();
} else if (cleanPath === '/devlog') {
  renderDevlog();
} else if (cleanPath === '/free-download') {
  renderFreeDownload();
} else if (cleanPath === '/apps') {
  renderCategory('apps', { page: 1, limit: 20, sort: 'newest' });
} else if (cleanPath === '/games') {
  renderCategory('games', { page: 1, limit: 20, sort: 'newest' });
} else if (cleanPath === '/movies') {
  renderMoviesDiscontinued();
} else if (path.startsWith('/search')) {
  const q = searchParams.get('q') || '';
  renderSearchResults(q);
} else if (path.startsWith('/game/')) {
  const id = path.split('/')[2];
  if (id) renderDetail(id, 'game', 'home', {});
} else if (path.startsWith('/movie/')) {
  renderMoviesDiscontinued();
} else {
  renderHome();
}
if (cleanPath === '/') history.replaceState({ page: 'home' }, '', '/');

// ---- HIDE INITIAL LOADER ----
const initialLoader = document.getElementById('initial-loader');
if (initialLoader) {
  setTimeout(() => {
    initialLoader.classList.add('hidden');
  }, 100);
}
