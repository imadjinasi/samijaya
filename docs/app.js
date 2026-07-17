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
  renderLoginBar();
}

// === RENDER: LOGIN BAR (inside hero) ===
function renderLoginBar() {
  var bar = document.getElementById('login-bar');
  if (session.token && session.member) {
    bar.innerHTML =
      '<div class="login-bar-info">' +
        '<div>' +
          '<span class="member-greeting">Halo ' + escHtml(session.member.nama) + '</span>' +
          '<span class="member-poin">' + Number(session.member.total_poin || 0) + ' poin</span>' +
        '</div>' +
        '<button class="btn-logout" onclick="logout()">Keluar</button>' +
      '</div>';
  } else {
    bar.innerHTML =
      '<label class="login-label" for="login-hp">Masukkan Nomor WhatsApp</label>' +
      '<div class="login-form-row">' +
        '<input type="tel" id="login-hp" placeholder="08xxxxxxxxxx" maxlength="15">' +
        '<button class="btn-primary btn-login" onclick="handleCheckMember()">Lanjut</button>' +
      '</div>';
  }
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
  showToast('Fitur checkout segera hadir!');
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

  // Render header & login bar
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
