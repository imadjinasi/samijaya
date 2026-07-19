/* ============================================================
   SAMIJAYA — app.js
   Frontend logic. Vanilla JS, tanpa library.
   ============================================================ */

// === STATE ===
var catalog = null;
var cart = [];
var session = { token: null, member: null };
var _bannerInterval = null;
var _bannerIndex = 0;
var _activeCategory = null; // null = Semua
var _viewMode = 'list';
var _otpCooldownTimer = null;
var _pendingCheckout = false;
var _submitting = false;
var _pendingOtp = '';
var checkoutState = {
  tgl_antar: '',
  metode_kirim: '',
  lokasi_pickup_id: '',
  jam_pilih: '',
  origin_terpilih: null,
  slot_id: '',
  metode_bayar: '',
  pakai_poin: false,
  lat: '',
  lng: '',
  alamat_teks: '',
  label_alamat: '',
  detail_alamat: '',
  jarak_km: 0,
  ongkir: null,
  address_id: ''
};

// === API HELPER ===
async function api(action, payload) {
  if (!payload) payload = {};
  var body = { action: action, payload: payload };
  if (session.token) body.token = session.token;
  var res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(body)
  });
  return res.json();
}

// === FORMAT HELPERS ===
function formatRupiah(n) {
  return 'Rp' + Number(n).toLocaleString('id-ID');
}

function escHtml(str) {
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// === TOAST ===
function showToast(msg) {
  var existing = document.querySelector('.toast');
  if (existing) existing.remove();
  var t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(function () {
    t.classList.add('show');
  });
  setTimeout(function () {
    t.classList.remove('show');
    setTimeout(function () { t.remove(); }, 300);
  }, 2000);
}

// === LOADING ===
function showLoading() {
  document.getElementById('loading-overlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loading-overlay').classList.add('hidden');
}

// === CART PERSISTENCE ===
function saveCart() {
  localStorage.setItem('sj_cart', JSON.stringify(cart));
}

function loadCart() {
  try {
    var raw = localStorage.getItem('sj_cart');
    if (raw) cart = JSON.parse(raw);
  } catch (e) {
    cart = [];
  }
}

function saveSession() {
  localStorage.setItem('sj_session', JSON.stringify(session));
}

function loadSession() {
  try {
    var raw = localStorage.getItem('sj_session');
    if (raw) session = JSON.parse(raw);
  } catch (e) {
    session = { token: null, member: null };
  }
}

// === CART LOGIC ===
function addToCart(product) {
  var found = null;
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].product_id === product.product_id) {
      found = cart[i];
      break;
    }
  }
  if (found) {
    found.qty++;
  } else {
    cart.push({
      product_id: product.product_id,
      nama: product.nama,
      harga: Number(product.harga),
      qty: 1
    });
  }
  saveCart();
  renderCartBottomBar();
  renderHeader();
  showToast(product.nama + ' ditambahkan');
}

function updateQty(product_id, delta) {
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].product_id === product_id) {
      cart[i].qty += delta;
      if (cart[i].qty <= 0) {
        cart.splice(i, 1);
      }
      break;
    }
  }
  saveCart();
  renderCartBottomBar();
  renderHeader();
  renderCartModal();
}

function removeFromCart(product_id) {
  for (var i = 0; i < cart.length; i++) {
    if (cart[i].product_id === product_id) {
      cart.splice(i, 1);
      break;
    }
  }
  saveCart();
  renderCartBottomBar();
  renderHeader();
  renderCartModal();
}

function getCartTotal() {
  var total = 0;
  for (var i = 0; i < cart.length; i++) {
    total += cart[i].harga * cart[i].qty;
  }
  return total;
}

function getCartCount() {
  var count = 0;
  for (var i = 0; i < cart.length; i++) {
    count += cart[i].qty;
  }
  return count;
}

// === SVG ICONS (inline, stroke, no library) ===
var ICON = {
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
  bottle: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="6" width="12" height="22" rx="3"/><line x1="10" y1="12" x2="22" y2="12"/><path d="M13 6V4h6v2"/></svg>'
};

// === RENDER: HEADER ===
function renderHeader() {
  var count = getCartCount();
  var badge = document.getElementById('cart-badge');
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  renderHeaderAuth();
}

// === RENDER: HEADER AUTH (replaces old renderLoginBar) ===
function renderHeaderAuth() {
  var authEl = document.getElementById('header-auth');
  if (!authEl) return;

  if (session.token && session.member) {
    // Logged in: show chip with name + poin
    var nama = escHtml(session.member.nama);
    var poin = Number(session.member.total_poin || 0);
    authEl.innerHTML =
      '<div class="header-user-chip">' +
        '<button class="header-user-btn" onclick="toggleUserDropdown()">' +
          '<span class="header-user-name">' + nama + '</span>' +
          '<span class="header-user-poin">• ' + poin + ' poin</span>' +
        '</button>' +
        '<div class="header-dropdown hidden" id="header-dropdown">' +
          '<button onclick="showMyOrders()">Pesanan Saya</button>' +
          '<button onclick="logout()">Keluar</button>' +
        '</div>' +
      '</div>';
  } else {
    // Not logged in: show "Masuk" button
    authEl.innerHTML =
      '<button class="btn-header-login" onclick="showLoginModal()">Masuk</button>';
  }
}

// Toggle user dropdown
function toggleUserDropdown() {
  var dd = document.getElementById('header-dropdown');
  if (!dd) return;
  dd.classList.toggle('hidden');

  // Close dropdown when clicking outside
  if (!dd.classList.contains('hidden')) {
    setTimeout(function () {
      function closeHandler(e) {
        if (!dd.contains(e.target) && !e.target.closest('.header-user-btn')) {
          dd.classList.add('hidden');
          document.removeEventListener('click', closeHandler);
        }
      }
      document.addEventListener('click', closeHandler);
    }, 0);
  }
}

// === LOGIN MODAL ===
function showLoginModal() {
  var modal = document.getElementById('login-modal');
  modal.classList.remove('hidden');

  var box = modal.querySelector('.modal-sheet');
  var html = '<div class="modal-handle"></div>';
  html += '<button class="modal-close" onclick="closeLoginModal()">&times;</button>';
  html += '<div class="modal-title">Masuk / Daftar</div>';
  html += '<div class="login-modal-row">';
  html += '<label class="login-modal-label" for="login-hp">Nomor WhatsApp</label>';
  html += '<input type="tel" id="login-hp" placeholder="08xxxxxxxxxx" maxlength="15">';
  html += '<button class="btn-login-submit" onclick="handleCheckMember()">Lanjut</button>';
  html += '</div>';

  box.innerHTML = html;

  var hpInput = document.getElementById('login-hp');
  if (hpInput) hpInput.focus();
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.add('hidden');
}

// === RENDER: BANNERS ===
function renderBanners(banners) {
  var slider = document.getElementById('banner-slider');
  if (!banners || banners.length === 0) {
    slider.classList.add('hidden');
    stopBannerAutoScroll();
    return;
  }
  slider.classList.remove('hidden');

  var trackHtml = '<div class="banner-track" id="banner-track">';
  for (var i = 0; i < banners.length; i++) {
    var fotoId = String(banners[i].foto_file_id || '').trim();
    var imgUrl = fotoId
      ? 'https://drive.google.com/thumbnail?id=' + fotoId + '&sz=w800'
      : '';
    trackHtml += '<div class="banner-slide">';
    if (imgUrl) {
      trackHtml += '<img src="' + imgUrl + '" alt="' + escHtml(banners[i].judul || '') + '" loading="lazy">';
    }
    trackHtml += '</div>';
  }
  trackHtml += '</div>';

  var dotsHtml = '<div class="banner-dots" id="banner-dots">';
  for (var i = 0; i < banners.length; i++) {
    dotsHtml += '<button class="banner-dot' + (i === 0 ? ' active' : '') + '" data-idx="' + i + '"></button>';
  }
  dotsHtml += '</div>';

  slider.innerHTML = trackHtml + dotsHtml;

  _bannerIndex = 0;
  startBannerAutoScroll(banners.length);

  // Dot clicks
  var dots = document.querySelectorAll('.banner-dot');
  dots.forEach(function (dot) {
    dot.addEventListener('click', function () {
      _bannerIndex = Number(this.getAttribute('data-idx'));
      slideBannerTo(_bannerIndex, banners.length);
    });
  });
}

function slideBannerTo(idx, total) {
  var track = document.getElementById('banner-track');
  if (!track) return;
  track.style.transform = 'translateX(-' + (idx * 100) + '%)';
  var dots = document.querySelectorAll('.banner-dot');
  dots.forEach(function (d, i) {
    d.classList.toggle('active', i === idx);
  });
}

function startBannerAutoScroll(total) {
  stopBannerAutoScroll();
  if (total <= 1) return;
  _bannerInterval = setInterval(function () {
    if (document.hidden) return;
    _bannerIndex = (_bannerIndex + 1) % total;
    slideBannerTo(_bannerIndex, total);
  }, 4000);
}

function stopBannerAutoScroll() {
  if (_bannerInterval) {
    clearInterval(_bannerInterval);
    _bannerInterval = null;
  }
}

// === RENDER: CATEGORIES ===
function renderCategories(categories) {
  var tabs = document.getElementById('category-tabs');
  var html = '<select class="cat-dropdown" onchange="filterCategory(this.value)">';
  html += '<option value="">Kategori: Semua</option>';
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    html += '<option value="' + escHtml(c.kategori_id) + '">Kategori: ' + escHtml(c.nama) + '</option>';
  }
  html += '</select>';
  tabs.innerHTML = html;
  _activeCategory = null;
}

function filterCategory(catId) {
  _activeCategory = catId || null;
  applyFilters();
}

function applyFilters() {
  var searchVal = '';
  var searchInput = document.querySelector('#search-box input');
  if (searchInput) searchVal = searchInput.value.trim().toLowerCase();

  var cards = document.querySelectorAll('.product-card');
  cards.forEach(function (card) {
    var cardCat = card.getAttribute('data-category');
    var cardName = card.getAttribute('data-name').toLowerCase();

    var matchCat = !_activeCategory || cardCat === _activeCategory;
    var matchSearch = !searchVal || cardName.indexOf(searchVal) !== -1;

    if (matchCat && matchSearch) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
}

// === VIEW MODE ===
function loadViewMode() {
  try {
    var saved = localStorage.getItem('sj_view_mode');
    if (saved === 'grid') _viewMode = 'grid';
  } catch (e) {}
}

function setViewMode(mode) {
  _viewMode = mode;
  localStorage.setItem('sj_view_mode', mode);
  renderViewMode();
}

function renderViewMode() {
  var grid = document.getElementById('product-grid');
  var btnList = document.getElementById('btn-view-list');
  var btnGrid = document.getElementById('btn-view-grid');
  
  if (!grid) return;

  if (_viewMode === 'grid') {
    grid.classList.add('grid-mode');
    if (btnGrid) btnGrid.classList.add('active');
    if (btnList) btnList.classList.remove('active');
  } else {
    grid.classList.remove('grid-mode');
    if (btnList) btnList.classList.add('active');
    if (btnGrid) btnGrid.classList.remove('active');
  }
}

// === RENDER: PRODUCTS ===
function renderProducts(products) {
  var grid = document.getElementById('product-grid');
  var html = '';
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var isHabis = (Number(p.tersedia) === 0);
    var imgHtml = '';
    if (p.foto_url) {
      var fullUrl = p.foto_file_id ? 'https://lh3.googleusercontent.com/d/' + escHtml(p.foto_file_id) + '=w1200' : escHtml(p.foto_url);
      imgHtml = '<img src="' + escHtml(p.foto_url) + '" alt="' + escHtml(p.nama) + '" loading="lazy" style="cursor: pointer;" onclick="window.open(\'' + fullUrl + '\', \'_blank\')">';
    } else {
      imgHtml = '<div class="product-img-placeholder">' + ICON.bottle + '</div>';
    }

    var badgeHtml = '';
    if (isHabis) {
      badgeHtml = '<div class="product-badge" style="background:#8B2E2E;color:#fff;">HABIS</div>';
    } else {
      var badge = String(p.badge_promo || '').trim();
      if (badge) {
        badgeHtml = '<div class="product-badge">' + escHtml(badge) + '</div>';
      }
    }

    var addBtn = isHabis
      ? '<div class="btn-add btn-habis" style="background:#e0e0e0;color:#999;width:auto;padding:0 12px;border-radius:var(--r-pill);font-size:0.75rem;font-weight:bold;cursor:not-allowed;">Habis</div>'
      : '<button class="btn-add" onclick="onAddToCart(\'' + escHtml(p.product_id) + '\')" aria-label="Tambah ' + escHtml(p.nama) + '">' + ICON.plus + '</button>';

    html +=
      '<div class="product-card ' + (isHabis ? 'out-of-stock' : '') + '" data-category="' + escHtml(p.kategori_id || '') + '" data-name="' + escHtml(p.nama) + '" data-pid="' + escHtml(p.product_id) + '">' +
        '<div class="product-img-wrap">' +
          imgHtml +
        '</div>' +
        badgeHtml +
        '<div class="product-info">' +
          '<div class="product-name">' + escHtml(p.nama) + '</div>' +
          '<div class="product-desc">' + escHtml(p.deskripsi || '') + '</div>' +
          '<div class="product-price">' + formatRupiah(p.harga) + '</div>' +
        '</div>' +
        addBtn +
      '</div>';
  }
  grid.innerHTML = html;
}

function onAddToCart(productId) {
  if (!catalog || !catalog.products) return;
  for (var i = 0; i < catalog.products.length; i++) {
    if (catalog.products[i].product_id === productId) {
      if (Number(catalog.products[i].tersedia) === 0) {
        showToast('Produk ini sedang habis.');
        return;
      }
      addToCart(catalog.products[i]);
      return;
    }
  }
}

// === RENDER: SEARCH ===
function onSearchInput(e) {
  applyFilters();
}

// === RENDER: CART BOTTOM BAR ===
function renderCartBottomBar() {
  var bar = document.getElementById('cart-bottom-bar');
  var count = getCartCount();
  var total = getCartTotal();

  var hasHabis = false;
  if (catalog && catalog.products) {
    for (var i = 0; i < cart.length; i++) {
      for (var j = 0; j < catalog.products.length; j++) {
        if (catalog.products[j].product_id === cart[i].product_id && Number(catalog.products[j].tersedia) === 0) {
          hasHabis = true;
          break;
        }
      }
      if (hasHabis) break;
    }
  }
  var dotHtml = hasHabis ? '<span style="position:absolute;top:-4px;right:-4px;background:#E74C3C;color:#fff;font-size:0.6rem;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;">!</span>' : '';

  if (count === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML =
    '<div class="cart-bar-info">' +
      '<div>' + count + ' item • ' + formatRupiah(total) + '</div>' +
    '</div>' +
    '<div style="position:relative;">' +
      '<button class="btn-view-cart" onclick="openCartModal()">Lihat Keranjang</button>' +
      dotHtml +
    '</div>';
}

// === CART MODAL ===
function openCartModal() {
  document.getElementById('cart-modal').classList.remove('hidden');
  renderCartModal();
}

function closeCartModal() {
  document.getElementById('cart-modal').classList.add('hidden');
}

function renderCartModal() {
  var container = document.querySelector('#cart-modal .modal-sheet');
  if (!container) return;

  var html = '<div class="modal-handle"></div>';
  html += '<button class="modal-close" onclick="closeCartModal()">&times;</button>';
  html += '<div class="modal-title">Keranjang Belanja</div>';

  if (cart.length === 0) {
    html += '<div class="cart-empty">Keranjang kosong</div>';
    container.innerHTML = html;
    return;
  }

  html += '<div class="cart-list">';
  for (var i = 0; i < cart.length; i++) {
    var item = cart[i];
    var imgHtml = '';
    
    // Cari detail produk dari catalog untuk mengambil foto (tanpa menyimpannya di localStorage)
    var p = null;
    if (catalog && catalog.products) {
      for (var j = 0; j < catalog.products.length; j++) {
        if (catalog.products[j].product_id === item.product_id) {
          p = catalog.products[j];
          break;
        }
      }
    }

    var isHabis = (p && Number(p.tersedia) === 0);

    if (p && p.foto_url) {
      var fullUrl = p.foto_file_id ? 'https://lh3.googleusercontent.com/d/' + escHtml(p.foto_file_id) + '=w1200' : escHtml(p.foto_url);
      var imgStyle = isHabis ? 'filter: grayscale(100%) opacity(0.6); cursor: pointer;' : 'cursor: pointer;';
      imgHtml = '<div class="cart-item-thumb" style="position:relative;"><img src="' + escHtml(p.foto_url) + '" alt="' + escHtml(item.nama) + '" style="' + imgStyle + '" onclick="window.open(\'' + fullUrl + '\', \'_blank\')">' + (isHabis ? '<div style="position:absolute;bottom:0;left:0;right:0;background:#8B2E2E;color:#fff;font-size:0.55rem;text-align:center;padding:2px 0;font-weight:bold;">HABIS</div>' : '') + '</div>';
    } else {
      imgHtml = '<div class="cart-item-thumb placeholder" style="position:relative;display:flex;align-items:center;justify-content:center;color:var(--brown)">' + ICON.bottle + (isHabis ? '<div style="position:absolute;bottom:0;left:0;right:0;background:#8B2E2E;color:#fff;font-size:0.55rem;text-align:center;padding:2px 0;font-weight:bold;">HABIS</div>' : '') + '</div>';
    }

    var itemNameHtml = isHabis 
      ? '<div class="cart-item-name"><span style="color:#C0392B;font-weight:bold;">[HABIS]</span> ' + escHtml(item.nama) + '</div>' 
      : '<div class="cart-item-name">' + escHtml(item.nama) + '</div>';

    html +=
      '<div class="cart-item" data-pid="' + escHtml(item.product_id) + '">' +
        imgHtml +
        '<div class="cart-item-info">' +
          itemNameHtml +
          '<div class="cart-item-price">' + formatRupiah(item.harga) + ' × ' + item.qty + '</div>' +
        '</div>' +
        '<div class="cart-item-qty">' +
          (isHabis
            ? '<button class="btn-habis-remove" onclick="removeFromCart(\'' + escHtml(item.product_id) + '\')" style="color:#C0392B;font-size:0.75rem;padding:4px 10px;border:1px solid #C0392B;border-radius:var(--r-pill);white-space:nowrap;background:transparent;">Hapus</button>'
            : '<button onclick="updateQty(\'' + escHtml(item.product_id) + '\', -1)">' + ICON.minus + '</button><span>' + item.qty + '</span><button onclick="updateQty(\'' + escHtml(item.product_id) + '\', 1)">' + ICON.plus + '</button>'
          ) +
        '</div>' +
        (isHabis ? '' : '<button class="cart-item-remove" onclick="removeFromCart(\'' + escHtml(item.product_id) + '\')" title="Hapus">' + ICON.trash + '</button>') +
      '</div>';
  }
  html += '</div>';

  html +=
    '<div class="cart-total">' +
      '<span>Total</span>' +
      '<span class="total-amount">' + formatRupiah(getCartTotal()) + '</span>' +
    '</div>';

  html += '<button class="btn-checkout" onclick="handleCheckout()">Lanjut Checkout</button>';

  container.innerHTML = html;
}

function handleCheckout() {
  if (cart.length === 0) {
    showToast('Keranjang kosong');
    return;
  }

  var hasHabis = false;
  var firstHabisId = null;
  if (catalog && catalog.products) {
    for (var i = 0; i < cart.length; i++) {
      for (var j = 0; j < catalog.products.length; j++) {
        if (catalog.products[j].product_id === cart[i].product_id && Number(catalog.products[j].tersedia) === 0) {
          hasHabis = true;
          firstHabisId = cart[i].product_id;
          break;
        }
      }
      if (hasHabis) break;
    }
  }
  if (hasHabis) {
    showToast('Ada produk habis di keranjang. Hapus dulu untuk lanjut.');
    var badItem = document.querySelector('.cart-item[data-pid="' + firstHabisId + '"]');
    if (badItem) badItem.scrollIntoView({behavior: 'smooth', block: 'center'});
    return;
  }

  // Gate: must be logged in
  if (!session.token || !session.member) {
    _pendingCheckout = true;
    closeCartModal();
    showLoginModal();
    return;
  }
  closeCartModal();
  openCheckoutScreen();
}

// === AUTH UI ===
function handleCheckMember() {
  var input = document.getElementById('login-hp');
  if (!input) return;
  var hp = input.value.trim();
  if (!hp) {
    showToast('Masukkan nomor HP');
    return;
  }
  // Close login modal before proceeding
  closeLoginModal();
  requestOtpFlow(hp);
}

async function requestOtpFlow(hp) {
  showLoading();
  try {
    var res = await api('requestOtp', { no_hp: hp });
    hideLoading();
    if (res.ok) {
      showOtpModal(hp);
    } else if (res.code === 'OTP_COOLDOWN') {
      var wait = (res.data && res.data.wait_seconds) || 120;
      showOtpModal(hp, wait);
    } else {
      showToast(res.error || 'Gagal mengirim OTP');
    }
  } catch (e) {
    hideLoading();
    showToast('Gagal terhubung ke server');
  }
}

function showOtpModal(no_hp, cooldownSeconds) {
  var modal = document.getElementById('otp-modal');
  modal.classList.remove('hidden');

  var box = modal.querySelector('.modal-sheet');
  var html = '<div class="modal-handle"></div>';
  html += '<button class="modal-close" onclick="closeOtpModal()">&times;</button>';
  html += '<div class="modal-title">Verifikasi OTP</div>';
  html += '<p class="otp-subtitle">OTP telah dikirim ke admin. Tanyakan OTP Anda.</p>';

  // 6 digit inputs
  html += '<div class="otp-input-wrap" id="otp-inputs">';
  for (var i = 0; i < 6; i++) {
    html += '<input type="tel" maxlength="1" data-idx="' + i + '" autocomplete="off">';
  }
  html += '</div>';

  html += '<div class="otp-timer" id="otp-timer"></div>';
  html += '<div class="error-msg" id="otp-error"></div>';
  html += '<button class="btn-verify-otp" id="btn-verify-otp" onclick="handleVerifyOtp(\'' + escHtml(no_hp) + '\')">Verifikasi</button>';

  box.innerHTML = html;

  // OTP input behavior
  setupOtpInputs();

  // Start cooldown timer
  if (cooldownSeconds && cooldownSeconds > 0) {
    startOtpCooldown(cooldownSeconds, no_hp);
  } else {
    var otpResend = 120; // 2 menit default
    startOtpCooldown(otpResend, no_hp);
  }
}

function setupOtpInputs() {
  var inputs = document.querySelectorAll('#otp-inputs input');
  inputs.forEach(function (inp, idx) {
    inp.addEventListener('input', function () {
      // Only accept digits
      this.value = this.value.replace(/\D/g, '');
      if (this.value && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && idx > 0) {
        inputs[idx - 1].focus();
      }
    });
    inp.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      for (var j = 0; j < inputs.length && j < text.length; j++) {
        inputs[j].value = text[j];
      }
      if (text.length >= inputs.length) {
        inputs[inputs.length - 1].focus();
      }
    });
  });
  if (inputs.length > 0) inputs[0].focus();
}

function getOtpValue() {
  var inputs = document.querySelectorAll('#otp-inputs input');
  var otp = '';
  inputs.forEach(function (inp) { otp += inp.value; });
  return otp;
}

function startOtpCooldown(seconds, no_hp) {
  if (_otpCooldownTimer) clearInterval(_otpCooldownTimer);
  var remaining = seconds;
  var timerEl = document.getElementById('otp-timer');
  if (!timerEl) return;

  function update() {
    if (remaining > 0) {
      var m = Math.floor(remaining / 60);
      var s = remaining % 60;
      timerEl.innerHTML = 'Kirim ulang dalam <strong>' + m + ':' + (s < 10 ? '0' : '') + s + '</strong>';
      remaining--;
    } else {
      timerEl.innerHTML = '<button onclick="resendOtp(\'' + escHtml(no_hp) + '\')">Kirim Ulang OTP</button>';
      clearInterval(_otpCooldownTimer);
      _otpCooldownTimer = null;
    }
  }
  update();
  _otpCooldownTimer = setInterval(update, 1000);
}

async function resendOtp(no_hp) {
  showLoading();
  try {
    var res = await api('requestOtp', { no_hp: no_hp });
    hideLoading();
    if (res.ok) {
      showToast('OTP baru telah dikirim');
      startOtpCooldown(120, no_hp);
    } else if (res.code === 'OTP_COOLDOWN') {
      var wait = (res.data && res.data.wait_seconds) || 120;
      startOtpCooldown(wait, no_hp);
      showToast(res.error);
    } else {
      showToast(res.error || 'Gagal mengirim OTP');
    }
  } catch (e) {
    hideLoading();
    showToast('Gagal terhubung ke server');
  }
}

function closeOtpModal() {
  document.getElementById('otp-modal').classList.add('hidden');
  if (_otpCooldownTimer) {
    clearInterval(_otpCooldownTimer);
    _otpCooldownTimer = null;
  }
}

async function handleVerifyOtp(no_hp, nama) {
  var otp = getOtpValue();
  if (otp.length !== 6) {
    document.getElementById('otp-error').textContent = 'Masukkan 6 digit OTP';
    return;
  }

  var btn = document.getElementById('btn-verify-otp');
  if (btn) btn.disabled = true;
  document.getElementById('otp-error').textContent = '';

  showLoading();
  try {
    var payload = { no_hp: no_hp, otp: otp };
    if (nama) payload.nama = nama;
    var res = await api('verifyOtp', payload);
    hideLoading();

    if (res.ok) {
      session.token = res.data.token;
      session.member = res.data.member;
      saveSession();
      closeOtpModal();
      renderHeader();
      showToast('Selamat datang, ' + session.member.nama + '!');
      // Continue to checkout if pending
      if (_pendingCheckout) {
        _pendingCheckout = false;
        if (cart.length > 0) {
          setTimeout(function() { openCheckoutScreen(); }, 400);
        }
      }
    } else if (res.code === 'NAMA_REQUIRED') {
      _pendingOtp = otp;
      closeOtpModal();
      showRegisterModal(no_hp);
    } else {
      document.getElementById('otp-error').textContent = res.error || 'OTP salah';
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    hideLoading();
    document.getElementById('otp-error').textContent = 'Gagal terhubung ke server';
    if (btn) btn.disabled = false;
  }
}

// === REGISTER MODAL ===
function showRegisterModal(no_hp) {
  var modal = document.getElementById('register-modal');
  modal.classList.remove('hidden');

  var box = modal.querySelector('.modal-sheet');
  var html = '<div class="modal-handle"></div>';
  html += '<button class="modal-close" onclick="closeRegisterModal()">&times;</button>';
  html += '<div class="modal-title">Daftar Member Baru</div>';
  html += '<div class="register-form">';
  html += '<label>Nama Lengkap</label>';
  html += '<input type="text" id="register-nama" placeholder="Masukkan nama lengkap">';
  html += '<label>Nomor HP</label>';
  html += '<input type="tel" id="register-hp" value="' + escHtml(no_hp) + '" readonly>';
  html += '<div class="error-msg" id="register-error"></div>';
  html += '<button class="btn-register" id="btn-register" onclick="handleRegister(\'' + escHtml(no_hp) + '\')">Daftar</button>';
  html += '</div>';

  box.innerHTML = html;

  var namaInput = document.getElementById('register-nama');
  if (namaInput) namaInput.focus();
}

function closeRegisterModal() {
  document.getElementById('register-modal').classList.add('hidden');
  _pendingOtp = '';
}

async function handleRegister(no_hp) {
  var nama = document.getElementById('register-nama').value.trim();
  if (!nama) {
    document.getElementById('register-error').textContent = 'Nama wajib diisi';
    return;
  }

  var btn = document.getElementById('btn-register');
  if (btn) btn.disabled = true;
  document.getElementById('register-error').textContent = '';

  showLoading();
  try {
    // Reuse the OTP by verifying directly
    var res = await api('verifyOtp', { no_hp: no_hp, otp: _pendingOtp, nama: nama });
    hideLoading();

    if (res.ok) {
      _pendingOtp = '';
      session.token = res.data.token;
      session.member = res.data.member;
      saveSession();
      closeRegisterModal();
      renderHeader();
      showToast('Selamat datang, ' + session.member.nama + '!');
      if (_pendingCheckout) {
        _pendingCheckout = false;
        if (cart.length > 0) {
          setTimeout(function() { openCheckoutScreen(); }, 400);
        }
      }
    } else {
      document.getElementById('register-error').textContent = res.error || 'Gagal registrasi';
      if (btn) btn.disabled = false;
    }
  } catch (e) {
    hideLoading();
    document.getElementById('register-error').textContent = 'Gagal terhubung ke server';
    if (btn) btn.disabled = false;
  }
}

function showOtpModalWithName(no_hp, nama, cooldownSeconds) {
  var modal = document.getElementById('otp-modal');
  modal.classList.remove('hidden');

  var box = modal.querySelector('.modal-sheet');
  var html = '<div class="modal-handle"></div>';
  html += '<button class="modal-close" onclick="closeOtpModal()">&times;</button>';
  html += '<div class="modal-title">Verifikasi OTP</div>';
  html += '<p class="otp-subtitle">OTP baru dikirim untuk pendaftaran <strong>' + escHtml(nama) + '</strong></p>';

  html += '<div class="otp-input-wrap" id="otp-inputs">';
  for (var i = 0; i < 6; i++) {
    html += '<input type="tel" maxlength="1" data-idx="' + i + '" autocomplete="off">';
  }
  html += '</div>';

  html += '<div class="otp-timer" id="otp-timer"></div>';
  html += '<div class="error-msg" id="otp-error"></div>';
  // Pass nama as extra data
  html += '<button class="btn-verify-otp" id="btn-verify-otp" onclick="handleVerifyOtp(\'' + escHtml(no_hp) + '\', \'' + escHtml(nama) + '\')">Verifikasi</button>';

  box.innerHTML = html;
  setupOtpInputs();

  var cd = cooldownSeconds || 120;
  startOtpCooldown(cd, no_hp);
}

// === LOGOUT ===
function logout() {
  session = { token: null, member: null };
  localStorage.removeItem('sj_session');
  renderHeader();
  showToast('Berhasil keluar');
}

// === CHECKOUT SCREEN ===
function resetCheckoutState() {
  checkoutState = {
    tgl_antar: '',
    metode_kirim: '',
    lokasi_pickup_id: '',
    jam_pilih: '',
    origin_terpilih: null,
    slot_id: '',
    metode_bayar: '',
    pakai_poin: false,
    lat: '',
    lng: '',
    alamat_teks: '',
    label_alamat: '',
    detail_alamat: '',
    jarak_km: 0,
    ongkir: null,
    address_id: ''
  };
}

function openCheckoutScreen() {
  resetCheckoutState();
  renderCheckoutScreen();
  document.getElementById('checkout-screen').classList.remove('hidden');
  document.getElementById('checkout-screen').scrollTop = 0;
  // Prevent body scroll
  document.body.style.overflow = 'hidden';
}

function closeCheckoutScreen() {
  document.getElementById('checkout-screen').classList.add('hidden');
  document.body.style.overflow = '';
  // Re-open cart modal
  openCartModal();
}

function renderCheckoutScreen() {
  var el = document.getElementById('checkout-screen');
  var member = session.member || {};
  var settings = (catalog && catalog.settings) ? catalog.settings : {};
  var poin = Number(member.total_poin || 0);
  var subtotal = getCartTotal();
  var count = getCartCount();

  // Hitung jam & tanggal minimum (Asia/Jakarta)
  var now = new Date();
  var jktTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
  var jktHour = jktTime.getHours();
  var minDays = (jktHour >= 18) ? 2 : 1;
  jktTime.setDate(jktTime.getDate() + minDays);
  
  var minStr = jktTime.getFullYear() + '-' +
    String(jktTime.getMonth() + 1).padStart(2, '0') + '-' +
    String(jktTime.getDate()).padStart(2, '0');

  var html = '<div class="checkout-inner">';

  // === HEADER ===
  html += '<div class="checkout-header">';
  html += '<button class="checkout-back-btn" onclick="closeCheckoutScreen()" aria-label="Kembali">';
  html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
  html += '</button>';
  html += '<div class="checkout-header-title">Checkout</div>';
  html += '</div>';

  // === 1. ORDER SUMMARY ===
  html += '<div class="co-section" id="checkout-order-summary">';
  html += '<div class="co-section-title"><span class="co-step">1</span>Ringkasan Pesanan</div>';
  html += '<button class="co-summary-toggle open" onclick="toggleOrderSummary()">';
  html += '<span>' + count + ' item · ' + formatRupiah(subtotal) + '</span>';
  html += '<span class="co-toggle-arrow">▼</span>';
  html += '</button>';
  html += '<div class="co-summary-items" id="co-summary-items">';
  for (var i = 0; i < cart.length; i++) {
    var item = cart[i];
    html += '<div class="co-summary-row">';
    html += '<span class="item-name">' + escHtml(item.nama) + ' × ' + item.qty + '</span>';
    html += '<span class="item-sub">' + formatRupiah(item.harga * item.qty) + '</span>';
    html += '</div>';
  }
  html += '<div class="co-subtotal-row">';
  html += '<span>Subtotal</span>';
  html += '<span>' + formatRupiah(subtotal) + '</span>';
  html += '</div>';
  html += '</div>'; // co-summary-items
  html += '</div>'; // co-section

  // === 2. CUSTOMER DATA ===
  html += '<div class="co-section" id="checkout-customer">';
  html += '<div class="co-section-title"><span class="co-step">2</span>Data Customer</div>';
  html += '<div class="co-customer-info">';
  html += '<div class="co-customer-row"><span class="co-label">Nama</span><span class="co-value">' + escHtml(member.nama || '-') + '</span></div>';
  html += '<div class="co-customer-row"><span class="co-label">HP</span><span class="co-value">' + escHtml(member.no_hp || '-') + '</span></div>';
  html += '</div>';
  html += '</div>';

  // === 3. TANGGAL PENGANTARAN ===
  html += '<div class="co-section" id="checkout-date">';
  html += '<div class="co-section-title"><span class="co-step">3</span>Tanggal Pengantaran</div>';
  html += '<div class="co-date-wrap">';
  html += '<label class="co-date-label" for="co-date-input">Tanggal Pengantaran (bukan tanggal order)</label>';
  html += '<input type="date" id="co-date-input" class="co-date-input" min="' + minStr + '" onchange="onCheckoutDateChange(this.value)">';
  html += '<div class="co-date-hint" style="font-size: 0.8rem; color: #666; margin-top: 5px;">Pemesanan minimal H+1. Pesanan di atas jam 18.00 WIB minimal H+2.</div>';
  html += '<div class="co-date-error" id="co-date-error"></div>';
  html += '</div>';
  html += '</div>';

  // === 4. METODE PENGIRIMAN ===
  html += '<div class="co-section" id="checkout-shipping">';
  html += '<div class="co-section-title"><span class="co-step">4</span>Metode Pengiriman</div>';
  html += '<div class="co-pill-group" id="co-shipping-pills">';
  html += '<button class="co-pill" data-method="AMBIL" onclick="selectShippingMethod(\'AMBIL\')">';
  html += '📍 Ambil Sendiri</button>';
  html += '<button class="co-pill" data-method="DIANTAR" onclick="selectShippingMethod(\'DIANTAR\')">';
  html += '🛵 Diantar</button>';
  html += '<button class="co-pill" data-method="OJOL" onclick="selectShippingMethod(\'OJOL\')">';
  html += '📱 Ojol</button>';
  html += '</div>';
  html += '<div id="co-shipping-detail"></div>';
  html += '</div>';

  // === 5. PEMBAYARAN ===
  html += '<div class="co-section" id="checkout-payment">';
  html += '<div class="co-section-title"><span class="co-step">5</span>Pembayaran</div>';
  html += '<div class="co-pill-group" id="co-payment-pills">';
  html += '<button class="co-pill" data-pay="COD" onclick="selectPayment(\'COD\')">💵 COD</button>';
  html += '<button class="co-pill" data-pay="TRANSFER" onclick="selectPayment(\'TRANSFER\')">🏦 Transfer</button>';
  html += '</div>';
  html += '<div id="co-payment-detail"></div>';
  html += '</div>';

  // === 6. GUNAKAN POIN ===
  var pointMinRedeem = Number(settings.POINT_MIN_REDEEM || 0);
  var poinDisabled = poin < pointMinRedeem || poin <= 0;
  html += '<div class="co-section" id="checkout-points">';
  html += '<div class="co-section-title"><span class="co-step">6</span>Gunakan Poin</div>';
  html += '<div class="co-points-wrap">';
  html += '<div class="co-points-check">';
  html += '<input type="checkbox" id="co-use-points" ' + (poinDisabled ? 'disabled' : '') + ' onchange="onTogglePoints(this.checked)">';
  html += '<label for="co-use-points">Gunakan poin (' + poin + ' poin)</label>';
  html += '</div>';
  if (poinDisabled && poin > 0 && pointMinRedeem > 0) {
    html += '<div class="co-points-min-note">Minimal ' + pointMinRedeem + ' poin untuk menukar.</div>';
  }
  if (poin <= 0) {
    html += '<div class="co-points-detail">Anda belum memiliki poin.</div>';
  }
  html += '<div class="co-points-detail" id="co-points-info"></div>';
  html += '</div>';
  html += '</div>';

  // === 7. CATATAN ===
  html += '<div class="co-section" id="checkout-note">';
  html += '<div class="co-catatan-wrap" style="margin-top:0;">';
  html += '<label class="co-label" for="co-catatan">Catatan untuk Samijaya (opsional)</label>';
  html += '<textarea id="co-catatan" class="co-catatan-input" rows="2" placeholder="Contoh: jangan terlalu manis, minta plastik besar…"></textarea>';
  html += '</div>';
  html += '</div>';

  // === 8. RINGKASAN BIAYA ===
  html += '<div class="co-cost-summary" id="checkout-cost-summary">';
  
  html += '<div class="co-cost-header" onclick="toggleCostDetails()">';
  html += '<span>Rincian Biaya</span>';
  html += '<svg class="co-cost-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  html += '</div>';
  
  html += '<div class="co-cost-details collapsed" id="co-cost-details">';
  html += '<div class="co-cost-row"><span>Subtotal produk</span><span class="co-cost-val" id="co-cost-subtotal">' + formatRupiah(subtotal) + '</span></div>';
  html += '<div class="co-cost-row"><span>Ongkir</span><span class="co-cost-val" id="co-cost-ongkir">—</span></div>';
  html += '<div class="co-cost-row" id="co-cost-poin-row" style="display:none"><span>Potongan poin</span><span class="co-cost-val discount" id="co-cost-poin">-Rp0</span></div>';
  html += '</div>';

  html += '<div class="co-cost-row total"><span>TOTAL</span><span class="co-cost-val" id="co-cost-total">' + formatRupiah(subtotal) + '</span></div>';
  
  html += '<button id="btn-create-order" onclick="handleCreateOrder()" disabled>Buat Pesanan</button>';
  html += '<div class="co-submit-note" id="co-submit-note">Lengkapi semua pilihan untuk melanjutkan.</div>';
  html += '<div class="co-validation-msg" id="co-validation-msg"></div>';
  html += '</div>';

  html += '</div>'; // checkout-inner

  el.innerHTML = html;
  updateCheckoutSummary();
}

function toggleCostDetails() {
  var details = document.getElementById('co-cost-details');
  var icon = document.querySelector('.co-cost-icon');
  if (!details) return;
  details.classList.toggle('collapsed');
  if (icon) icon.classList.toggle('open');
}

function toggleOrderSummary() {
  var btn = document.querySelector('.co-summary-toggle');
  var items = document.getElementById('co-summary-items');
  if (!btn || !items) return;
  btn.classList.toggle('open');
  items.classList.toggle('collapsed');
}

// === DATE ===
function onCheckoutDateChange(val) {
  checkoutState.tgl_antar = val;
  var errEl = document.getElementById('co-date-error');
  if (!errEl) return;

  // Check holidays
  if (val && catalog && catalog.holidays) {
    for (var h = 0; h < catalog.holidays.length; h++) {
      var hDate = String(catalog.holidays[h].tanggal || '').trim();
      if (hDate === val) {
        var ket = catalog.holidays[h].keterangan || 'Libur';
        errEl.textContent = 'Tanggal libur (' + ket + '), pilih tanggal lain.';
        updateCheckoutSummary();
        return;
      }
    }
  }
  errEl.textContent = '';
  updateCheckoutSummary();
}

function isDateHoliday(val) {
  if (!val || !catalog || !catalog.holidays) return false;
  for (var h = 0; h < catalog.holidays.length; h++) {
    if (String(catalog.holidays[h].tanggal || '').trim() === val) return true;
  }
  return false;
}

// === SHIPPING METHOD ===
function selectShippingMethod(method) {
  method = method.trim();
  checkoutState.metode_kirim = method;
  checkoutState.lokasi_pickup_id = '';
  checkoutState.jam_pilih = '';
  checkoutState.slot_id = '';
  checkoutState.address_id = '';
  checkoutState.lat = '';
  checkoutState.lng = '';
  checkoutState.ongkir = null;
  checkoutState.jarak_km = 0;

  // Highlight pill
  var pills = document.querySelectorAll('#co-shipping-pills .co-pill');
  pills.forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-method').trim() === method);
  });

  renderShippingDetail(method);

  if (method === 'DIANTAR') {
    setTimeout(function() {
      if (typeof initDeliveryMap === 'function') {
        initDeliveryMap('delivery-map-section', onPinMoved);
      }
    }, 120);
  }

  updateCheckoutSummary();
}

function renderShippingDetail(method) {
  var container = document.getElementById('co-shipping-detail');
  if (!container) return;
  var html = '<div class="co-shipping-detail">';

  if (method === 'AMBIL' || method === 'OJOL') {
    var locations = (catalog && catalog.pickupLocations) ? catalog.pickupLocations : [];
    html += '<div style="margin-top:10px; margin-bottom:10px;">';
    html += '<label class="co-label" style="display:block; margin-bottom:5px;">Pilih Lokasi</label>';
    html += '<select id="co-pickup-select" class="co-date-input" onchange="onPickupChange(this.value)">';
    html += '<option value="">— Pilih lokasi —</option>';
    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i];
      if (String(loc.status).toLowerCase() === 'aktif' || String(loc.status) === '1' || loc.status === true) {
        var label = escHtml(loc.nama) + ' (' + escHtml(loc.jam_buka || '') + '–' + escHtml(loc.jam_tutup || '') + ')';
        html += '<option value="' + escHtml(loc.lokasi_id) + '">' + label + '</option>';
      }
    }
    html += '</select>';
    html += '</div>';

    html += '<div id="co-time-container" style="display:none; margin-bottom:10px;">';
    var timeLabel = method === 'AMBIL' ? 'Jam ambil' : 'Jam jemput driver';
    html += '<label class="co-label" style="display:block; margin-bottom:5px;">' + timeLabel + '</label>';
    html += '<input type="time" id="co-pickup-time" onchange="onPickupTimeChange(this.value)" class="co-date-input">';
    html += '<div id="co-time-error" style="color:var(--danger); font-size:0.85rem; margin-top:5px;"></div>';
    html += '</div>';

    var note = method === 'AMBIL' 
      ? 'Pesanan disiapkan setelah pembayaran dikonfirmasi. Datang pada jam yang dipilih.'
      : 'Pesan driver ojek online untuk menjemput di lokasi & jam yang dipilih. Tidak ada ongkir dari Samijaya.';
    html += '<div class="co-shipping-note" style="opacity:1;font-size:0.85rem;">' + note + '</div>';
  } else if (method === 'DIANTAR') {
    var member = session.member || {};
    var addresses = member.addresses || session.addresses || [];

    html += '<div id="delivery-address-selection">';
    if (addresses && addresses.length > 0) {
      html += '<select id="co-address-select" class="co-date-input" style="margin-bottom:10px;" onchange="onSavedAddressChange(this.value)">';
      html += '<option value="">— Pilih alamat tersimpan —</option>';
      for (var i = 0; i < addresses.length; i++) {
        html += '<option value="' + addresses[i].address_id + '">' + escHtml(addresses[i].label + ' - ' + addresses[i].detail) + '</option>';
      }
      html += '<option value="NEW">+ Alamat baru</option>';
      html += '</select>';
    }

    var showNew = (!addresses || addresses.length === 0);
    html += '<div id="delivery-new-address" class="' + (showNew ? '' : 'hidden') + '">';
    
    html += '<div class="search-address-wrap">';
    html += '<input type="text" id="co-search-address" class="search-address-input" placeholder="Cari alamat / tempat…" oninput="onSearchAddressInput(event)">';
    html += '<div id="co-search-results" class="search-results hidden"></div>';
    html += '</div>';
    
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      html += '<button type="button" id="btn-use-location" class="btn-use-location" onclick="handleUseMyLocation()">📍 Gunakan lokasi saya</button>';
      html += '<div id="location-error-msg" style="display:none; font-size:0.8rem; color:var(--danger); margin-bottom:8px;"></div>';
    }
    
    html += '<div id="checkoutMapHint" style="font-size:13-14px; color:var(--brown); padding:8px 0;">💡 Geser pin merah untuk menyesuaikan lokasi pengantaran.</div>';
    html += '<div id="delivery-map-section" class="map-container"></div>';

    html += '<div class="address-form">';
    html += '<textarea id="co-alamat-teks" placeholder="Alamat lengkap (otomatis terisi)" readonly rows="2"></textarea>';
    html += '<input type="text" id="co-label-alamat" placeholder="Label alamat (contoh: Rumah, Kantor)" oninput="onAddressDetailChange()">';
    html += '<textarea id="co-detail-alamat" placeholder="Detail alamat (patokan, blok, dll)" oninput="onAddressDetailChange()" rows="2"></textarea>';
    html += '</div>';

    html += '</div>'; // delivery-new-address
    html += '</div>'; // delivery-address-selection

    html += '<div class="co-shipping-note" id="co-ongkir-note">Ongkir: —</div>';
    
    html += '<div style="margin-top: 15px; border-top: 1px dashed var(--border); padding-top: 15px;">';
    html += '<div class="co-section-title" style="font-size:1rem; margin-bottom:10px;">Pilih Slot Waktu</div>';
    html += '<div class="co-pill-group" id="co-slot-pills">';
    var slots = (catalog && catalog.deliverySlots) ? catalog.deliverySlots : [];
    for (var s = 0; s < slots.length; s++) {
      var sl = slots[s];
      if (String(sl.status).toLowerCase() === 'aktif' || String(sl.status) === '1' || sl.status === true) {
        html += '<button class="co-pill co-slot-pill" data-slotid="' + escHtml(sl.slot_id) + '" onclick="selectSlot(\'' + escHtml(sl.slot_id) + '\')">';
        html += escHtml(sl.jam_mulai) + ' – ' + escHtml(sl.jam_selesai);
        html += '</button>';
      }
    }
    html += '</div>';
    html += '<div class="co-slot-note" style="font-size:0.85rem; color:#666; text-align:center; margin-top:5px;">Waktu bersifat estimasi dan dapat disesuaikan Samijaya.</div>';
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function onPickupChange(val) {
  checkoutState.lokasi_pickup_id = val;
  var timeContainer = document.getElementById('co-time-container');
  if (val) {
    if (timeContainer) timeContainer.style.display = 'block';
  } else {
    if (timeContainer) timeContainer.style.display = 'none';
  }
  validatePickupTime();
  updateCheckoutSummary();
}

function onPickupTimeChange(val) {
  checkoutState.jam_pilih = val;
  validatePickupTime();
  updateCheckoutSummary();
}

function validatePickupTime() {
  var errEl = document.getElementById('co-time-error');
  if (!errEl) return true;
  if (!checkoutState.lokasi_pickup_id || !checkoutState.jam_pilih) {
    errEl.textContent = '';
    return true;
  }
  var loc = null;
  if (catalog && catalog.pickupLocations) {
    for (var i = 0; i < catalog.pickupLocations.length; i++) {
      if (catalog.pickupLocations[i].lokasi_id === checkoutState.lokasi_pickup_id) {
        loc = catalog.pickupLocations[i];
        break;
      }
    }
  }
  if (loc && loc.jam_buka && loc.jam_tutup) {
    var jBuka = loc.jam_buka;
    var jTutup = loc.jam_tutup;
    var jPilih = checkoutState.jam_pilih;
    if (jPilih < jBuka || jPilih > jTutup) {
      errEl.textContent = 'Di luar jam operasional ' + escHtml(loc.nama) + ' (' + jBuka + '–' + jTutup + ')';
      return false;
    }
  }
  errEl.textContent = '';
  return true;
}

function onSavedAddressChange(val) {
  var newAddressContainer = document.getElementById('delivery-new-address');
  if (val === 'NEW') {
    newAddressContainer.classList.remove('hidden');
    checkoutState.address_id = '';
    setTimeout(function() {
      if (typeof initDeliveryMap === 'function') {
        initDeliveryMap('delivery-map-section', onPinMoved);
      }
    }, 120);
    checkoutState.lat = '';
    checkoutState.lng = '';
    checkoutState.ongkir = null;
    updateCheckoutSummary();
  } else if (val !== '') {
    newAddressContainer.classList.add('hidden');
    checkoutState.address_id = val;
    var allAddresses = session.addresses || (session.member && session.member.addresses) || [];
    var addr = null;
    for (var i = 0; i < allAddresses.length; i++) {
      if (allAddresses[i].address_id === val) {
        addr = allAddresses[i];
        break;
      }
    }
    if (addr) {
      checkoutState.lat = addr.latitude;
      checkoutState.lng = addr.longitude;
      checkoutState.alamat_teks = addr.detail;
      calculateOngkir();
    }
  } else {
    newAddressContainer.classList.add('hidden');
    checkoutState.address_id = '';
    checkoutState.lat = '';
    checkoutState.lng = '';
    checkoutState.ongkir = null;
    updateCheckoutSummary();
  }
}

var _searchAddressTimer = null;
async function onSearchAddressInput(e) {
  var val = e.target.value.trim();
  var resContainer = document.getElementById('co-search-results');
  if (!val) {
    resContainer.classList.add('hidden');
    return;
  }
  
  if (_searchAddressTimer) clearTimeout(_searchAddressTimer);
  _searchAddressTimer = setTimeout(async function() {
    if (typeof searchPlacePhoton !== 'function') return;
    var results = await searchPlacePhoton(val);
    if (results.length > 0) {
      var html = '';
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        html += '<div class="search-result-item" onclick="onSelectSearchResult(' + r.lat + ', ' + r.lng + ', \'' + escHtml(r.label).replace(/'/g, "\\'") + '\')">' + escHtml(r.label) + '</div>';
      }
      resContainer.innerHTML = html;
      resContainer.classList.remove('hidden');
    } else {
      resContainer.classList.add('hidden');
    }
  }, 400);
}

function onSelectSearchResult(lat, lng, label) {
  document.getElementById('co-search-results').classList.add('hidden');
  document.getElementById('co-search-address').value = label;
  
  if (typeof initDeliveryMap === 'function') {
    initDeliveryMap('delivery-map-section', onPinMoved, lat, lng);
  }
  
  updateDeliveryLocation(lat, lng);
}

function handleUseMyLocation() {
  if (!navigator.geolocation) return;
  var btn = document.getElementById('btn-use-location');
  var errMsg = document.getElementById('location-error-msg');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Mencari lokasi…';
  }
  if (errMsg) errMsg.style.display = 'none';

  navigator.geolocation.getCurrentPosition(
    function(pos) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📍 Gunakan lokasi saya';
      }
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      
      if (typeof initDeliveryMap === 'function') {
        initDeliveryMap('delivery-map-section', onPinMoved, lat, lng);
      }
      updateDeliveryLocation(lat, lng);
    },
    function(err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📍 Gunakan lokasi saya';
      }
      if (errMsg) {
        errMsg.textContent = 'Tidak bisa mengambil lokasi. Pilih manual di peta atau cari alamat.';
        errMsg.style.display = 'block';
      }
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

var _reverseGeocodeTimer = null;
function onPinMoved(lat, lng) {
  if (_reverseGeocodeTimer) clearTimeout(_reverseGeocodeTimer);
  
  var elAlamat = document.getElementById('co-alamat-teks');
  if (elAlamat) elAlamat.value = "Mencari alamat...";
  
  _reverseGeocodeTimer = setTimeout(function() {
    updateDeliveryLocation(lat, lng);
  }, 1000);
}

async function updateDeliveryLocation(lat, lng) {
  checkoutState.lat = lat;
  checkoutState.lng = lng;
  checkoutState.address_id = '';
  
  var alamat = '';
  if (typeof reverseGeocode === 'function') {
    alamat = await reverseGeocode(lat, lng);
  }
  checkoutState.alamat_teks = alamat;
  
  var elAlamat = document.getElementById('co-alamat-teks');
  if (elAlamat) elAlamat.value = alamat;
  
  calculateOngkir();
}

function onAddressDetailChange() {
  checkoutState.label_alamat = document.getElementById('co-label-alamat') ? document.getElementById('co-label-alamat').value : '';
  checkoutState.detail_alamat = document.getElementById('co-detail-alamat') ? document.getElementById('co-detail-alamat').value : '';
}

function calculateOngkir() {
  if (typeof haversineKm !== 'function' || typeof hitungOngkir !== 'function' || typeof getOriginLatLng !== 'function') return;
  
  var origin = getOriginLatLng(checkoutState.lat, checkoutState.lng);
  checkoutState.origin_terpilih = origin;
  
  var lurus = haversineKm(origin.lat, origin.lng, checkoutState.lat, checkoutState.lng);
  var hasil = hitungOngkir(lurus);
  
  checkoutState.jarak_km = hasil.jarak_km;
  
  var settings = (catalog && catalog.settings) ? catalog.settings : {};
  var maxKm = Number(settings.ONGKIR_RADIUS_MAX_KM || 15);
  
  var note = document.getElementById('co-ongkir-note');
  if (hasil.jarak_km > maxKm) {
    checkoutState.ongkir = null;
    if (note) {
      note.innerHTML = 'Jarak: ' + hasil.jarak_km + ' km. Ongkir: — (Di luar jangkauan)';
      note.style.color = 'var(--danger)';
    }
  } else {
    checkoutState.ongkir = hasil.ongkir;
    if (note) {
      note.innerHTML = 'Jarak: ' + hasil.jarak_km + ' km. Ongkir: ' + formatRupiah(hasil.ongkir);
      note.style.color = 'inherit';
    }
  }
  
  updateCheckoutSummary();
}

// === SLOT ===
function selectSlot(slotId) {
  checkoutState.slot_id = slotId;
  var pills = document.querySelectorAll('#co-slot-pills .co-pill');
  pills.forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-slotid') === slotId);
  });
  updateCheckoutSummary();
}

// === PAYMENT ===
function selectPayment(method) {
  checkoutState.metode_bayar = method;
  var pills = document.querySelectorAll('#co-payment-pills .co-pill');
  pills.forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-pay') === method);
  });
  renderPaymentDetail(method);
  updateCheckoutSummary();
}

function renderPaymentDetail(method) {
  var container = document.getElementById('co-payment-detail');
  if (!container) return;

  if (method !== 'TRANSFER') {
    container.innerHTML = '';
    return;
  }

  var settings = (catalog && catalog.settings) ? catalog.settings : {};
  var html = '<div class="co-payment-detail"><div class="co-transfer-info">';

  // QRIS
  var qrisId = String(settings.QRIS_FILE_ID || '').trim();
  if (qrisId) {
    html += '<div class="co-qris-wrap">';
    html += '<img src="https://drive.google.com/thumbnail?id=' + escHtml(qrisId) + '&sz=w400" alt="QRIS" loading="lazy">';
    html += '<div class="co-qris-label">Scan QRIS</div>';
    html += '</div>';
  }

  // Bank info
  var bank = String(settings.REKENING_BANK || '').trim();
  var nomor = String(settings.REKENING_NOMOR || '').trim();
  var nama = String(settings.REKENING_NAMA || '').trim();
  if (bank || nomor || nama) {
    html += '<div class="co-bank-info">';
    if (bank) html += '<strong>' + escHtml(bank) + '</strong><br>';
    if (nomor) html += 'No. Rek: ' + escHtml(nomor) + '<br>';
    if (nama) html += 'a.n. ' + escHtml(nama);
    html += '</div>';
  }

  if (!qrisId && !bank && !nomor && !nama) {
    html += '<div class="co-shipping-note" style="opacity:1">Info rekening belum tersedia. Hubungi toko.</div>';
  }

  html += '</div></div>';
  container.innerHTML = html;
}

// === POINTS ===
function onTogglePoints(checked) {
  checkoutState.pakai_poin = checked;
  updateCheckoutSummary();
}

// === LIVE COST SUMMARY ===
function updateCheckoutSummary() {
  var subtotal = getCartTotal();
  var ongkir = 0;
  var ongkirDisplay = '—';
  var method = checkoutState.metode_kirim;

  var settings = (catalog && catalog.settings) ? catalog.settings : {};
  var maxKm = Number(settings.ONGKIR_RADIUS_MAX_KM || 15);

  if (method === 'AMBIL' || method === 'OJOL') {
    ongkir = 0;
    ongkirDisplay = formatRupiah(0);
  } else if (method === 'DIANTAR') {
    if (checkoutState.lat && checkoutState.lng) {
      if (checkoutState.ongkir === null) {
        ongkir = 0;
        ongkirDisplay = '—';
      } else {
        ongkir = checkoutState.ongkir;
        ongkirDisplay = formatRupiah(ongkir);
      }
    } else {
      ongkir = 0;
      ongkirDisplay = '—';
    }
  }

  // Points calculation
  var poinUsed = 0;
  var member = session.member || {};
  var poin = Number(member.total_poin || 0);
  var settings = (catalog && catalog.settings) ? catalog.settings : {};
  var pointMinRedeem = Number(settings.POINT_MIN_REDEEM || 0);

  if (checkoutState.pakai_poin && poin >= pointMinRedeem && poin > 0) {
    // 1 poin = Rp1
    var maxDiscount = subtotal + ongkir; // don't go below 0
    poinUsed = Math.min(poin, maxDiscount);
  }

  var total = subtotal + ongkir - poinUsed;
  if (total < 0) total = 0;

  // Update DOM
  var elSubtotal = document.getElementById('co-cost-subtotal');
  var elOngkir = document.getElementById('co-cost-ongkir');
  var elPoinRow = document.getElementById('co-cost-poin-row');
  var elPoin = document.getElementById('co-cost-poin');
  var elTotal = document.getElementById('co-cost-total');
  var elPointsInfo = document.getElementById('co-points-info');

  if (elSubtotal) elSubtotal.textContent = formatRupiah(subtotal);
  if (elOngkir) {
    elOngkir.textContent = ongkirDisplay;
    if (method === 'DIANTAR') {
      elOngkir.classList.add('pending');
    } else {
      elOngkir.classList.remove('pending');
    }
  }

  if (poinUsed > 0) {
    if (elPoinRow) elPoinRow.style.display = '';
    if (elPoin) elPoin.textContent = '-' + formatRupiah(poinUsed);
    if (elPointsInfo) {
      elPointsInfo.textContent = 'Dipakai: ' + poinUsed + ' poin. Sisa: ' + (poin - poinUsed) + ' poin.';
    }
  } else {
    if (elPoinRow) elPoinRow.style.display = 'none';
    if (elPoin) elPoin.textContent = '-Rp0';
    if (elPointsInfo) elPointsInfo.textContent = '';
  }

  if (elTotal) elTotal.textContent = formatRupiah(total);

  // Validation
  updateCheckoutValidation();
}

function updateCheckoutValidation() {
  var missing = [];
  if (!checkoutState.tgl_antar) missing.push('Tanggal pengantaran');
  if (checkoutState.tgl_antar && isDateHoliday(checkoutState.tgl_antar)) missing.push('Tanggal yang dipilih adalah hari libur');
  if (!checkoutState.metode_kirim) missing.push('Metode pengiriman');
  if (checkoutState.metode_kirim === 'AMBIL' || checkoutState.metode_kirim === 'OJOL') {
    if (!checkoutState.lokasi_pickup_id) missing.push('Lokasi pengambilan');
    if (!checkoutState.jam_pilih) {
      missing.push('Jam ' + (checkoutState.metode_kirim === 'AMBIL' ? 'ambil' : 'jemput'));
    } else if (!validatePickupTime()) {
      missing.push('Jam di luar operasional lokasi');
    }
  }
  if (checkoutState.metode_kirim === 'DIANTAR') {
    if (!checkoutState.lat || !checkoutState.lng) {
      missing.push('Titik lokasi pengantaran belum dipilih');
    }
    
    var settings = (catalog && catalog.settings) ? catalog.settings : {};
    var maxKm = Number(settings.ONGKIR_RADIUS_MAX_KM || 15);
    var minOrder = Number(settings.MIN_ORDER_DELIVERY || 0);
    
    if (checkoutState.lat && checkoutState.lng && checkoutState.ongkir === null) {
      missing.push('Di luar jangkauan antar (maks ' + maxKm + ' km)');
    }
    
    var subtotal = getCartTotal();
    if (subtotal < minOrder) {
      missing.push('Minimal order untuk diantar ' + formatRupiah(minOrder));
    }
    if (!checkoutState.slot_id) missing.push('Slot pengiriman');
  }
  if (!checkoutState.metode_bayar) missing.push('Metode pembayaran');

  var msgEl = document.getElementById('co-validation-msg');
  if (msgEl) {
    if (missing.length > 0) {
      var ul = '<ul>';
      for (var i = 0; i < missing.length; i++) {
        ul += '<li>' + escHtml(missing[i]) + '</li>';
      }
      ul += '</ul>';
      msgEl.innerHTML = 'Belum lengkap:' + ul;
    } else {
      msgEl.innerHTML = '';
    }
  }

  // Tombol TIDAK di-disable oleh validasi — hanya saat _submitting
  var btn = document.getElementById('btn-create-order');
  var noteEl = document.getElementById('co-submit-note');
  if (btn) {
    var isValid = (missing.length === 0);
    btn.disabled = _submitting;
    if (noteEl) {
      noteEl.textContent = isValid ? '' : 'Lengkapi semua pilihan untuk melanjutkan.';
    }
  }
}

// === BUILD PAYLOAD createOrder ===
function buildCreateOrderPayload() {
  var catatan = document.getElementById('co-catatan');
  var catatanVal = catatan ? catatan.value.trim() : '';

  var items = cart.map(function(i) {
    return { product_id: i.product_id, qty: i.qty };
  });

  var payload = {
    metode_kirim: checkoutState.metode_kirim,
    metode_bayar: checkoutState.metode_bayar,
    pakai_poin: checkoutState.pakai_poin,
    items: items,
    catatan_customer: catatanVal
  };

  if (checkoutState.metode_kirim === 'AMBIL' || checkoutState.metode_kirim === 'OJOL') {
    payload.lokasi_pickup_id = checkoutState.lokasi_pickup_id;
    payload.jam_pilih = checkoutState.jam_pilih;
  }

  // Tanggal antar dikirim untuk semua metode
  payload.tgl_antar = checkoutState.tgl_antar;

  if (checkoutState.metode_kirim === 'DIANTAR') {
    payload.address_id = checkoutState.address_id || '';
    // Susun alamat_snapshot: gabungkan label + alamat_teks + detail
    var snapshotParts = [];
    if (checkoutState.label_alamat) snapshotParts.push(checkoutState.label_alamat);
    if (checkoutState.alamat_teks) snapshotParts.push(checkoutState.alamat_teks);
    if (checkoutState.detail_alamat) snapshotParts.push(checkoutState.detail_alamat);
    payload.alamat_snapshot = snapshotParts.join(' — ');
    payload.lat = checkoutState.lat;
    payload.lng = checkoutState.lng;
    payload.slot_id = checkoutState.slot_id;
  }

  return payload;
}

// === HANDLE createOrder ===
async function handleCreateOrder() {
  if (_submitting) return;

  // Validasi ulang sebelum submit
  var missing = [];
  if (!checkoutState.tgl_antar) missing.push('Tanggal pengantaran');
  if (checkoutState.tgl_antar && isDateHoliday(checkoutState.tgl_antar)) missing.push('Tanggal yang dipilih adalah hari libur');
  if (!checkoutState.metode_kirim) missing.push('Metode pengiriman');
  if (checkoutState.metode_kirim === 'AMBIL' || checkoutState.metode_kirim === 'OJOL') {
    if (!checkoutState.lokasi_pickup_id) missing.push('Lokasi pengambilan');
    if (!checkoutState.jam_pilih) missing.push('Jam ambil/jemput');
  }
  if (checkoutState.metode_kirim === 'DIANTAR') {
    if (!checkoutState.lat || !checkoutState.lng) missing.push('Titik lokasi pengantaran');
    if (checkoutState.ongkir === null && checkoutState.lat) missing.push('Di luar jangkauan antar');
    if (!checkoutState.slot_id) missing.push('Slot pengiriman');
  }
  if (!checkoutState.metode_bayar) missing.push('Metode pembayaran');

  if (missing.length > 0) {
    var msgEl = document.getElementById('co-validation-msg');
    if (msgEl) {
      var ul = '<ul>';
      for (var k = 0; k < missing.length; k++) ul += '<li>' + escHtml(missing[k]) + '</li>';
      ul += '</ul>';
      msgEl.innerHTML = 'Belum lengkap:' + ul;
    }
    return;
  }

  // Set loading state
  _submitting = true;
  var btn = document.getElementById('btn-create-order');
  var originalText = 'Buat Pesanan';
  if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }

  var payload = buildCreateOrderPayload();

  try {
    var res = await api('createOrder', payload);
    if (res.ok) {
      // Sukses: kosongkan cart, buka halaman sukses
      cart = [];
      saveCart();
      renderCartBottomBar();
      renderHeader();
      // Tutup checkout
      document.getElementById('checkout-screen').classList.add('hidden');
      document.body.style.overflow = '';
      // Buka success screen
      showSuccessScreen(res.data);
    } else {
      // Handle error per code
      var errMsg = '';
      var doRetry = false;
      var goToSlot = false;
      var code = res.code || '';

      if (code === 'SIBUK_COBA_LAGI') {
        errMsg = 'Sistem sedang ramai, mencoba lagi…';
        doRetry = true;
      } else if (code === 'TOKO_TUTUP') {
        errMsg = 'Maaf, toko sedang tutup.';
      } else if (code === 'SLOT_PENUH') {
        errMsg = 'Slot pengiriman sudah penuh, pilih slot atau tanggal lain.';
        goToSlot = true;
      } else if (code === 'LUAR_JANGKAUAN') {
        errMsg = 'Alamat di luar jangkauan antar.';
      } else if (code === 'MIN_ORDER') {
        errMsg = 'Belum memenuhi minimal order untuk diantar.';
      } else if (code === 'TANGGAL_TERLALU_CEPAT') {
        errMsg = res.error || 'Tanggal pengantaran terlalu cepat, pilih tanggal lain.';
      } else if (code === 'PRODUK_TIDAK_TERSEDIA') {
        errMsg = (res.error || 'Produk tidak tersedia.') + ' Silakan refresh katalog dan periksa keranjang.';
      } else if (code === 'UNAUTHORIZED') {
        errMsg = 'Sesi habis, silakan login ulang.';
        session = { token: null, member: null };
        localStorage.removeItem('sj_session');
        renderHeader();
      } else {
        errMsg = res.error || 'Gagal membuat pesanan, coba lagi.';
      }

      // Tampilkan pesan error
      var msgEl = document.getElementById('co-validation-msg');
      if (msgEl) msgEl.innerHTML = '<div class="co-error-inline">' + escHtml(errMsg) + '</div>';

      if (doRetry) {
        // Auto-retry 1x setelah 1.5 detik — kelola flag sendiri
        _submitting = true; // tetap submitting selama retry
        if (btn) { btn.disabled = true; btn.textContent = 'Mencoba lagi…'; }
        setTimeout(async function() {
          if (msgEl) msgEl.innerHTML = '';
          if (btn) { btn.disabled = true; btn.textContent = 'Memproses…'; }
          try {
            var res2 = await api('createOrder', payload);
            if (res2.ok) {
              cart = [];
              saveCart();
              renderCartBottomBar();
              renderHeader();
              document.getElementById('checkout-screen').classList.add('hidden');
              document.body.style.overflow = '';
              showSuccessScreen(res2.data);
            } else {
              var msg2 = res2.error || 'Gagal membuat pesanan, coba lagi.';
              if (msgEl) msgEl.innerHTML = '<div class="co-error-inline">' + escHtml(msg2) + '</div>';
            }
          } catch (e2) {
            if (msgEl) msgEl.innerHTML = '<div class="co-error-inline">Gagal terhubung ke server.</div>';
          } finally {
            _submitting = false;
            if (btn) { btn.disabled = false; btn.textContent = originalText; }
          }
        }, 1500);
        return; // keluar — retry setTimeout mengelola flag sendiri
      }

      if (goToSlot) {
        // Scroll ke area slot
        setTimeout(function() {
          var slotEl = document.getElementById('co-slot-pills');
          if (slotEl) slotEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    }
  } catch (e) {
    var msgEl = document.getElementById('co-validation-msg');
    if (msgEl) msgEl.innerHTML = '<div class="co-error-inline">Gagal terhubung ke server, coba lagi.</div>';
  } finally {
    // SELALU reset _submitting & tombol — kecuali jika retry sedang berjalan (sudah return di atas)
    _submitting = false;
    if (btn) { btn.disabled = false; btn.textContent = originalText; }
  }
}

// === SUCCESS SCREEN ===
function showSuccessScreen(data) {
  var el = document.getElementById('success-screen');
  if (!el) return;
  renderSuccessScreen(data);
  el.classList.remove('hidden');
  el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeSuccessScreen() {
  var el = document.getElementById('success-screen');
  if (el) el.classList.add('hidden');
  document.body.style.overflow = '';
}

function renderSuccessScreen(data) {
  var el = document.getElementById('success-screen');
  if (!el) return;

  var orderId = data.order_id || '';
  var subtotal = data.subtotal || 0;
  var ongkir = data.ongkir || 0;
  var poinDipakai = data.poin_dipakai || 0;
  var total = data.total || 0;
  var metodeBayar = data.metode_bayar || '';
  var bayar = data.bayar || null;
  var waToko = String(data.wa_toko || '').replace(/[^0-9]/g, '');

  var html = '<div class="success-inner">';

  // Watermark mascot removed

  // Ikon sukses
  html += '<div class="success-icon-wrap">';
  html += '<svg class="success-checkmark" viewBox="0 0 52 52" fill="none">';
  html += '<circle cx="26" cy="26" r="25" stroke="currentColor" stroke-width="2"/>';
  html += '<path d="M14 26l8 8 16-16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  html += '</svg>';
  html += '</div>';

  html += '<h2 class="success-heading">Pesanan Diterima!</h2>';
  html += '<p class="success-sub">Terima kasih, pesanan kamu sedang menunggu konfirmasi Samijaya.</p>';

  // Order ID
  html += '<div class="success-order-id-wrap">';
  html += '<div class="success-order-id-label">Order ID</div>';
  html += '<div class="success-order-id" id="success-order-id-text">' + escHtml(orderId) + '</div>';
  html += '<button class="btn-copy-id" onclick="copyOrderId()" title="Salin Order ID">Salin</button>';
  html += '</div>';

  // Ringkasan biaya
  html += '<div class="success-cost-box">';
  html += '<div class="success-cost-row"><span>Subtotal produk</span><span>' + formatRupiah(subtotal) + '</span></div>';
  html += '<div class="success-cost-row"><span>Ongkos kirim</span><span>' + formatRupiah(ongkir) + '</span></div>';
  if (poinDipakai > 0) {
    html += '<div class="success-cost-row poin-row"><span>Potongan poin</span><span>-' + formatRupiah(poinDipakai) + '</span></div>';
  }
  html += '<div class="success-cost-row total-row"><span>TOTAL</span><span>' + formatRupiah(total) + '</span></div>';
  html += '</div>';

  // Status
  html += '<div class="success-status-badge">⏳ Menunggu konfirmasi Samijaya</div>';

  // === PEMBAYARAN ===
  if (metodeBayar === 'TRANSFER' && bayar) {
    html += '<div class="success-payment-box">';
    html += '<div class="success-payment-title">Selesaikan Pembayaran</div>';

    // QRIS
    if (bayar.qris_file_id) {
      html += '<div class="success-qris-wrap">';
      html += '<img src="https://drive.google.com/thumbnail?id=' + escHtml(bayar.qris_file_id) + '&sz=w400" alt="QRIS Samijaya" loading="lazy" class="success-qris-img">';
      html += '<div class="success-qris-label">Scan QRIS di atas</div>';
      html += '</div>';
    }

    // Rekening
    var bank = String(bayar.rekening_bank || '').trim();
    var nomor = String(bayar.rekening_nomor || '').trim();
    var nama = String(bayar.rekening_nama || '').trim();
    if (bank || nomor || nama) {
      html += '<div class="success-rekening-box">';
      html += '<div class="success-rekening-label">atau Transfer ke Rekening</div>';
      if (bank) html += '<div class="success-rek-row"><span class="rek-bank">' + escHtml(bank) + '</span></div>';
      if (nomor) {
        html += '<div class="success-rek-row rek-nomor-row">';
        html += '<span id="success-rek-nomor">' + escHtml(nomor) + '</span>';
        html += '<button class="btn-copy-nomor" onclick="copyRekening(\'' + escHtml(nomor) + '\')" title="Salin nomor rekening">Salin</button>';
        html += '</div>';
      }
      if (nama) html += '<div class="success-rek-row"><span>a.n. ' + escHtml(nama) + '</span></div>';
      html += '</div>';
    }

    // Tombol utama: kirim bukti via WA
    var waPesan = encodeURIComponent('Halo Samijaya, saya sudah transfer untuk pesanan ' + orderId + '. Berikut bukti transfernya:');
    html += '<a class="btn-success-primary" href="https://wa.me/' + escHtml(waToko) + '?text=' + waPesan + '" target="_blank" rel="noopener">📲 Kirim Bukti Transfer via WhatsApp</a>';
    html += '</div>';
  } else {
    // COD
    html += '<div class="success-payment-box">';
    html += '<div class="success-cod-note">💵 Bayar tunai saat pesanan diterima.</div>';
    var waPesanCod = encodeURIComponent('Halo Samijaya, saya baru membuat pesanan ' + orderId + '.');
    html += '<a class="btn-success-primary" href="https://wa.me/' + escHtml(waToko) + '?text=' + waPesanCod + '" target="_blank" rel="noopener">💬 Hubungi Samijaya</a>';
    html += '</div>';
  }

  // Tombol sekunder
  html += '<div class="success-actions-secondary">';
  html += '<button class="btn-success-secondary" onclick="closeSuccessScreen()">← Kembali ke Menu</button>';
  html += '<button class="btn-success-link" onclick="closeSuccessScreen(); showMyOrders();">Lihat Pesanan Saya</button>';
  html += '</div>';

  html += '</div>'; // success-inner
  el.innerHTML = html;
}

function copyOrderId() {
  var el = document.getElementById('success-order-id-text');
  if (!el) return;
  var text = el.textContent;
  navigator.clipboard.writeText(text).then(function() {
    showToast('Order ID disalin!');
  }).catch(function() {
    showToast(text);
  });
}

function copyRekening(nomor) {
  navigator.clipboard.writeText(nomor).then(function() {
    showToast('Nomor rekening disalin!');
  }).catch(function() {
    showToast(nomor);
  });
}

// === INIT ===
document.addEventListener('DOMContentLoaded', async function () {
  showLoading();

  // Muat session & view mode
  loadSession();
  loadViewMode();

  // Kalau ada token → getMe untuk validasi
  if (session.token) {
    try {
      var meRes = await api('getMe');
      if (meRes.ok) {
        session.member = meRes.data.member;
        saveSession();
      } else if (meRes.code === 'UNAUTHORIZED') {
        session = { token: null, member: null };
        localStorage.removeItem('sj_session');
      }
    } catch (e) {
      // Gagal koneksi, tetap pakai session lama
    }
  }

  // Muat cart dari localStorage
  loadCart();
  renderCartBottomBar();

  // Render header & auth
  renderHeader();

  // Fetch catalog
  try {
    var catRes = await api('getCatalog');
    if (catRes.ok) {
      catalog = catRes.data;
      renderBanners(catalog.banners);
      renderCategories(catalog.categories);
      renderProducts(catalog.products);
      renderViewMode();
    } else {
      showToast('Gagal memuat katalog');
    }
  } catch (e) {
    showToast('Gagal terhubung ke server');
  }

  hideLoading();

  // Setup search
  var searchInput = document.querySelector('#search-box input');
  if (searchInput) {
    searchInput.addEventListener('input', onSearchInput);
  }
});

// === PESANAN SAYA ===
function showMyOrders() {
  if (document.getElementById('header-dropdown')) {
    document.getElementById('header-dropdown').classList.add('hidden');
  }
  var el = document.getElementById('my-orders-screen');
  if (!el) return;
  
  var html = '<div class="checkout-inner">';
  html += '<div class="checkout-header">';
  html += '<button class="checkout-back-btn" onclick="hideMyOrders()" aria-label="Kembali">';
  html += '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
  html += '</button>';
  html += '<div class="checkout-header-title">Pesanan Saya</div>';
  html += '</div>';
  html += '<div id="my-orders-content" style="padding: 16px;">Memuat pesanan...</div>';
  html += '</div>';
  
  el.innerHTML = html;
  el.classList.remove('hidden');
  el.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  
  loadMyOrders();
}

function hideMyOrders() {
  var el = document.getElementById('my-orders-screen');
  if (el) el.classList.add('hidden');
  document.body.style.overflow = '';
}

async function loadMyOrders() {
  if (!session.token) {
    document.getElementById('my-orders-content').innerHTML = '<div style="text-align:center; padding: 40px 0;">Silakan login terlebih dahulu.</div>';
    return;
  }
  
  try {
    var res = await api('getMyOrders');
    if (res.ok) {
      renderMyOrders(res.data.orders || []);
    } else {
      document.getElementById('my-orders-content').innerHTML = '<div style="text-align:center; padding: 40px 0; color:var(--danger)">Gagal memuat pesanan.</div>';
    }
  } catch (e) {
    console.error("Error loadMyOrders:", e);
    document.getElementById('my-orders-content').innerHTML = '<div style="text-align:center; padding: 40px 0; color:var(--danger)">Gagal terhubung ke server.</div>';
  }
}

function formatDateIndo(isoString) {
  if (!isoString) return '-';
  var d = new Date(isoString);
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function formatTimeIndo(isoString) {
  if (!isoString) return '';
  var d = new Date(isoString);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function renderMyOrders(orders) {
  var container = document.getElementById('my-orders-content');
  if (!container) return;
  
  if (orders.length === 0) {
    var emptyHtml = '<div style="text-align:center; padding: 40px 20px;">';
    emptyHtml += '<div style="font-size:3rem; margin-bottom:16px;">☕</div>';
    emptyHtml += '<div style="font-size:1.1rem; color:var(--dark); font-weight:600; margin-bottom:8px;">Belum ada pesanan</div>';
    emptyHtml += '<div style="color:#666; margin-bottom:24px;">Yuk pesan minuman pertamamu!</div>';
    emptyHtml += '<button class="btn-success-primary" style="width:auto; padding:0 32px;" onclick="hideMyOrders()">Lihat Katalog</button>';
    emptyHtml += '</div>';
    container.innerHTML = emptyHtml;
    return;
  }
  
  var html = '';
  for (var i = 0; i < orders.length; i++) {
    var order = orders[i] || {};
    var oid = order.order_id || 'UNKNOWN';
    var statusClass = 'status-' + (order.status || '').toLowerCase();
    var tglAntarStr = order.tgl_antar ? formatDateIndo(order.tgl_antar) : '';
    
    html += '<div class="my-order-card">';
    html += '<div class="my-order-header">';
    html += '<span class="my-order-id">' + escHtml(oid) + '</span>';
    html += '<span class="my-order-date">' + formatDateIndo(order.created_at) + '</span>';
    html += '</div>';
    
    html += '<div class="my-order-status-wrap">';
    html += '<span class="my-order-status ' + statusClass + '">' + escHtml(order.status) + '</span>';
    html += '</div>';
    
    html += '<div class="my-order-meta">';
    var mtdKirim = (order.metode_kirim === 'AMBIL') ? 'AMBIL SENDIRI' : order.metode_kirim;
    html += escHtml(mtdKirim) + (tglAntarStr ? ' • ' + tglAntarStr : '');
    html += '</div>';
    
    html += '<div class="my-order-items-preview">';
    var maxItems = 2;
    var items = order.items || [];
    for (var j = 0; j < Math.min(items.length, maxItems); j++) {
      html += '<div class="my-order-item-row">';
      html += '<span>' + escHtml(items[j].nama_snapshot || '-') + ' × ' + (items[j].qty || 1) + '</span>';
      html += '</div>';
    }
    if (items.length > maxItems) {
      html += '<div class="my-order-item-row" style="color:#888; font-size:0.85rem;">+' + (items.length - maxItems) + ' item lainnya</div>';
    }
    html += '</div>';
    
    html += '<div class="my-order-footer">';
    html += '<div class="my-order-total">' + formatRupiah(order.total || 0) + '</div>';
    html += '<div class="my-order-actions">';
    html += '<button class="my-order-btn-detail" onclick="toggleOrderDetail(\'' + escHtml(oid) + '\')">Detail</button>';
    
    var waToko = (catalog && catalog.settings && catalog.settings.NOMOR_WA_TOKO) ? String(catalog.settings.NOMOR_WA_TOKO).replace(/[^0-9]/g, '') : '6285179912504';
    var waMsg = encodeURIComponent('Halo Samijaya, saya mau tanya pesanan ' + oid);
    html += '<a class="my-order-btn-wa" href="https://wa.me/' + waToko + '?text=' + waMsg + '" target="_blank" rel="noopener">Hubungi Samijaya</a>';
    html += '</div>';
    html += '</div>'; // footer
    
    // Expandable detail
    html += '<div class="my-order-detail collapsed" id="my-order-detail-' + escHtml(oid) + '">';
    
    // Timeline
    var timeline = order.timeline || [];
    if (timeline.length > 0) {
      html += '<div class="my-order-timeline">';
      for (var t = 0; t < timeline.length; t++) {
        var tm = timeline[t];
        html += '<div class="timeline-item">';
        html += '<div class="timeline-dot"></div>';
        html += '<div class="timeline-content">';
        html += '<div class="timeline-status">' + escHtml(tm.status || '-') + '</div>';
        html += '<div class="timeline-time">' + formatDateIndo(tm.at) + ' ' + formatTimeIndo(tm.at) + '</div>';
        html += '</div></div>';
      }
      html += '</div>';
    }
    
    // Alamat / Lokasi
    html += '<div class="my-order-info-group">';
    html += '<div class="my-order-info-label">' + (order.metode_kirim === 'DIANTAR' ? 'Alamat Pengantaran' : 'Lokasi Pengambilan') + '</div>';
    if (order.metode_kirim === 'DIANTAR') {
      html += '<div class="my-order-info-value">' + escHtml(order.alamat_snapshot || '-') + '</div>';
    } else {
      var locName = order.lokasi_pickup_id;
      if (catalog && catalog.pickupLocations && order.lokasi_pickup_id) {
        var foundLoc = catalog.pickupLocations.find(function(l) { return l.lokasi_id === order.lokasi_pickup_id; });
        if (foundLoc) locName = foundLoc.nama;
      }
      html += '<div class="my-order-info-value">' + escHtml(locName || '-') + '</div>';
    }
    html += '</div>';
    
    if (order.catatan_customer) {
      html += '<div class="my-order-info-group">';
      html += '<div class="my-order-info-label">Catatan</div>';
      html += '<div class="my-order-info-value">' + escHtml(order.catatan_customer) + '</div>';
      html += '</div>';
    }
    
    html += '<div class="my-order-info-group">';
    html += '<div class="my-order-info-label">Metode Pembayaran</div>';
    html += '<div class="my-order-info-value">' + escHtml(order.metode_bayar) + '</div>';
    html += '</div>';
    
    // Rincian Biaya
    html += '<div class="my-order-cost-breakdown">';
    html += '<div class="cost-row"><span>Subtotal</span><span>' + formatRupiah(order.subtotal || 0) + '</span></div>';
    html += '<div class="cost-row"><span>Ongkir</span><span>' + formatRupiah(order.ongkir || 0) + '</span></div>';
    if (order.poin_dipakai > 0) {
      html += '<div class="cost-row poin"><span>Potongan Poin</span><span>-' + formatRupiah(order.poin_dipakai) + '</span></div>';
    }
    html += '<div class="cost-row total"><span>Total Keseluruhan</span><span>' + formatRupiah(order.total || 0) + '</span></div>';
    html += '</div>';
    
    html += '</div>'; // my-order-detail
    html += '</div>'; // my-order-card
  }
  
  container.innerHTML = html;
}

function toggleOrderDetail(orderId) {
  var detailEl = document.getElementById('my-order-detail-' + orderId);
  if (detailEl) {
    detailEl.classList.toggle('collapsed');
  }
}
