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
var _otpCooldownTimer = null;
var _pendingCheckout = false;
var checkoutState = {
  tgl_antar: '',
  metode_kirim: '',
  lokasi_pickup_id: '',
  slot_id: '',
  metode_bayar: '',
  pakai_poin: false
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
  var html = '<button class="cat-tab active" data-id="" onclick="filterCategory(this, \'\')">Semua</button>';
  for (var i = 0; i < categories.length; i++) {
    var c = categories[i];
    html += '<button class="cat-tab" data-id="' + escHtml(c.kategori_id) + '" onclick="filterCategory(this, \'' + escHtml(c.kategori_id) + '\')">' + escHtml(c.nama) + '</button>';
  }
  tabs.innerHTML = html;
  _activeCategory = null;
}

function filterCategory(btn, catId) {
  // Highlight tab
  var tabs = document.querySelectorAll('.cat-tab');
  tabs.forEach(function (t) { t.classList.remove('active'); });
  btn.classList.add('active');

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

// === RENDER: PRODUCTS ===
function renderProducts(products) {
  var grid = document.getElementById('product-grid');
  var html = '';
  for (var i = 0; i < products.length; i++) {
    var p = products[i];
    var imgHtml = '';
    if (p.foto_url) {
      imgHtml = '<img src="' + escHtml(p.foto_url) + '" alt="' + escHtml(p.nama) + '" loading="lazy">';
    } else {
      imgHtml = '<div class="product-img-placeholder">' + ICON.bottle + '</div>';
    }

    var badgeHtml = '';
    var badge = String(p.badge_promo || '').trim();
    if (badge) {
      badgeHtml = '<div class="product-badge">' + escHtml(badge) + '</div>';
    }

    html +=
      '<div class="product-card" data-category="' + escHtml(p.kategori_id || '') + '" data-name="' + escHtml(p.nama) + '" data-pid="' + escHtml(p.product_id) + '">' +
        '<div class="product-img-wrap">' +
          imgHtml +
        '</div>' +
        badgeHtml +
        '<div class="product-info">' +
          '<div class="product-name">' + escHtml(p.nama) + '</div>' +
          '<div class="product-desc">' + escHtml(p.deskripsi || '') + '</div>' +
          '<div class="product-price">' + formatRupiah(p.harga) + '</div>' +
        '</div>' +
        '<button class="btn-add" onclick="onAddToCart(\'' + escHtml(p.product_id) + '\')" aria-label="Tambah ' + escHtml(p.nama) + '">' + ICON.plus + '</button>' +
      '</div>';
  }
  grid.innerHTML = html;
}

function onAddToCart(productId) {
  if (!catalog || !catalog.products) return;
  for (var i = 0; i < catalog.products.length; i++) {
    if (catalog.products[i].product_id === productId) {
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

  if (count === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  bar.innerHTML =
    '<div class="cart-bar-info">' +
      '<div>' + count + ' item • ' + formatRupiah(total) + '</div>' +
    '</div>' +
    '<button class="btn-view-cart" onclick="openCartModal()">Lihat Keranjang</button>';
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
    html +=
      '<div class="cart-item">' +
        '<div class="cart-item-info">' +
          '<div class="cart-item-name">' + escHtml(item.nama) + '</div>' +
          '<div class="cart-item-price">' + formatRupiah(item.harga) + ' × ' + item.qty + '</div>' +
        '</div>' +
        '<div class="cart-item-qty">' +
          '<button onclick="updateQty(\'' + escHtml(item.product_id) + '\', -1)">' + ICON.minus + '</button>' +
          '<span>' + item.qty + '</span>' +
          '<button onclick="updateQty(\'' + escHtml(item.product_id) + '\', 1)">' + ICON.plus + '</button>' +
        '</div>' +
        '<button class="cart-item-remove" onclick="removeFromCart(\'' + escHtml(item.product_id) + '\')" title="Hapus">' + ICON.trash + '</button>' +
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
    // Request OTP lagi untuk proses pendaftaran
    var res = await api('requestOtp', { no_hp: no_hp, nama: nama });
    hideLoading();

    if (res.ok) {
      closeRegisterModal();
      showOtpModalWithName(no_hp, nama);
    } else if (res.code === 'OTP_COOLDOWN') {
      var wait = (res.data && res.data.wait_seconds) || 120;
      closeRegisterModal();
      showOtpModalWithName(no_hp, nama, wait);
    } else {
      document.getElementById('register-error').textContent = res.error || 'Gagal';
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
    slot_id: '',
    metode_bayar: '',
    pakai_poin: false
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

  // Today as YYYY-MM-DD
  var today = new Date();
  var todayStr = today.getFullYear() + '-' +
    String(today.getMonth() + 1).padStart(2, '0') + '-' +
    String(today.getDate()).padStart(2, '0');

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
  html += '<input type="date" id="co-date-input" class="co-date-input" min="' + todayStr + '" onchange="onCheckoutDateChange(this.value)">';
  html += '<div class="co-date-error" id="co-date-error"></div>';
  html += '</div>';
  html += '</div>';

  // === 4. METODE PENGIRIMAN ===
  html += '<div class="co-section" id="checkout-shipping">';
  html += '<div class="co-section-title"><span class="co-step">4</span>Metode Pengiriman</div>';
  html += '<div class="co-pill-group" id="co-shipping-pills">';
  html += '<button class="co-pill" data-method="AMBIL" onclick="selectShippingMethod(\'AMBIL\')">';
  html += '📍 Ambil di Toko</button>';
  html += '<button class="co-pill" data-method="DIANTAR" onclick="selectShippingMethod(\'DIANTAR\')">';
  html += '🛵 Diantar</button>';
  html += '<button class="co-pill" data-method="OJOL" onclick="selectShippingMethod(\'OJOL\')">';
  html += '📱 Ojol</button>';
  html += '</div>';
  html += '<div id="co-shipping-detail"></div>';
  html += '</div>';

  // === 5. SLOT PENGIRIMAN ===
  html += '<div class="co-section" id="checkout-slots">';
  html += '<div class="co-section-title"><span class="co-step">5</span>Slot Pengiriman</div>';
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
  html += '<div class="co-slot-note">Waktu bersifat estimasi dan dapat disesuaikan Samijaya.</div>';
  html += '</div>';

  // === 6. PEMBAYARAN ===
  html += '<div class="co-section" id="checkout-payment">';
  html += '<div class="co-section-title"><span class="co-step">6</span>Pembayaran</div>';
  html += '<div class="co-pill-group" id="co-payment-pills">';
  html += '<button class="co-pill" data-pay="COD" onclick="selectPayment(\'COD\')">💵 COD</button>';
  html += '<button class="co-pill" data-pay="TRANSFER" onclick="selectPayment(\'TRANSFER\')">🏦 Transfer</button>';
  html += '</div>';
  html += '<div id="co-payment-detail"></div>';
  html += '</div>';

  // === 7. GUNAKAN POIN ===
  var pointMinRedeem = Number(settings.POINT_MIN_REDEEM || 0);
  var poinDisabled = poin < pointMinRedeem || poin <= 0;
  html += '<div class="co-section" id="checkout-points">';
  html += '<div class="co-section-title"><span class="co-step">7</span>Gunakan Poin</div>';
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

  // === 8. RINGKASAN BIAYA ===
  html += '<div class="co-cost-summary" id="checkout-cost-summary">';
  html += '<div class="co-cost-row"><span>Subtotal produk</span><span class="co-cost-val" id="co-cost-subtotal">' + formatRupiah(subtotal) + '</span></div>';
  html += '<div class="co-cost-row"><span>Ongkir</span><span class="co-cost-val" id="co-cost-ongkir">—</span></div>';
  html += '<div class="co-cost-row" id="co-cost-poin-row" style="display:none"><span>Potongan poin</span><span class="co-cost-val discount" id="co-cost-poin">-Rp0</span></div>';
  html += '<div class="co-cost-row total"><span>TOTAL</span><span class="co-cost-val" id="co-cost-total">' + formatRupiah(subtotal) + '</span></div>';
  html += '<button id="btn-create-order" disabled>Buat Pesanan</button>';
  html += '<div class="co-submit-note">Submit aktif setelah langkah berikutnya.</div>';
  html += '<div class="co-validation-msg" id="co-validation-msg"></div>';
  html += '</div>';

  html += '</div>'; // checkout-inner

  el.innerHTML = html;
  updateCheckoutSummary();
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

  // Highlight pill
  var pills = document.querySelectorAll('#co-shipping-pills .co-pill');
  pills.forEach(function(p) {
    p.classList.toggle('active', p.getAttribute('data-method').trim() === method);
  });

  renderShippingDetail(method);
  updateCheckoutSummary();
}

function renderShippingDetail(method) {
  var container = document.getElementById('co-shipping-detail');
  if (!container) return;
  var html = '<div class="co-shipping-detail">';

  if (method === 'AMBIL') {
    var locations = (catalog && catalog.pickupLocations) ? catalog.pickupLocations : [];
    html += '<select id="co-pickup-select" onchange="onPickupChange(this.value)">';
    html += '<option value="">— Pilih lokasi —</option>';
    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i];
      if (String(loc.status).toLowerCase() === 'aktif' || String(loc.status) === '1' || loc.status === true) {
        var label = escHtml(loc.nama) + ' (' + escHtml(loc.jam_buka || '') + '–' + escHtml(loc.jam_tutup || '') + ')';
        html += '<option value="' + escHtml(loc.lokasi_id) + '">' + label + '</option>';
      }
    }
    html += '</select>';
    html += '<div class="co-shipping-note">Ongkir: Rp0 (ambil sendiri)</div>';
  } else if (method === 'DIANTAR') {
    html += '<div class="co-shipping-placeholder">Peta & alamat akan aktif di langkah berikutnya.</div>';
    html += '<div id="delivery-map-section"></div>';
    html += '<div class="co-shipping-note">Ongkir: —</div>';
  } else if (method === 'OJOL') {
    html += '<div class="co-shipping-note" style="opacity:1;font-size:0.85rem;">🏍️ Driver dipesan oleh pembeli. Ongkir: Rp0</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function onPickupChange(val) {
  checkoutState.lokasi_pickup_id = val;
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
    if (nama) html += 'a/n ' + escHtml(nama);
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

  if (method === 'AMBIL' || method === 'OJOL') {
    ongkir = 0;
    ongkirDisplay = formatRupiah(0);
  } else if (method === 'DIANTAR') {
    ongkir = 0;
    ongkirDisplay = '—';
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
  if (checkoutState.metode_kirim === 'AMBIL' && !checkoutState.lokasi_pickup_id) missing.push('Lokasi pickup');
  if (!checkoutState.slot_id) missing.push('Slot pengiriman');
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

  // Button always disabled in 4a
  var btn = document.getElementById('btn-create-order');
  if (btn) btn.disabled = true;
}

// === INIT ===
document.addEventListener('DOMContentLoaded', async function () {
  showLoading();

  // Muat session
  loadSession();

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

  // Render header & auth
  renderHeader();

  // Muat cart dari localStorage
  loadCart();
  renderCartBottomBar();

  // Fetch catalog
  try {
    var catRes = await api('getCatalog');
    if (catRes.ok) {
      catalog = catRes.data;
      renderBanners(catalog.banners);
      renderCategories(catalog.categories);
      renderProducts(catalog.products);
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
