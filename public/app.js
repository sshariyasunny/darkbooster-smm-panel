// BestFollows SMM Dashboard Client Logic with Exact Admin USD & 127 BDT Sync
let currentUser = null;
let allServicesData = [];
let categoriesData = {};
let selectedServiceObj = null;
let currentPlatformFilter = 'ALL';
let currentCurrency = 'BDT'; // DEFAULT CURRENCY BDT (৳)
const BDT_CONVERSION_RATE = 127.0; // 1 USD = 127 BDT!

document.addEventListener('DOMContentLoaded', () => {
  initThemeSwitcher();
  if (window.lucide) {
    lucide.createIcons();
  }

  // Check tab-isolated session
  const storedUser = sessionStorage.getItem('smm_current_user');
  if (storedUser) {
    try {
      currentUser = JSON.parse(storedUser);
      initAuthenticatedApp();
    } catch (e) {
      showAuthOverlay(true);
    }
  } else {
    showAuthOverlay(true);
  }

  // Auth Form Submits
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
  document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);

  // Nav Links
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      switchToTab(tabId);
    });
  });

  // Mobile Sidebar & Backdrop Toggle
  const toggleBtn = document.getElementById('toggle-sidebar');
  const sidebarEl = document.getElementById('sidebar');
  const backdropEl = document.getElementById('sidebar-backdrop');
  
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      sidebarEl.classList.toggle('open');
      if (backdropEl) backdropEl.classList.toggle('active');
    });
  }
  if (backdropEl) {
    backdropEl.addEventListener('click', () => {
      sidebarEl.classList.remove('open');
      backdropEl.classList.remove('active');
    });
  }

  // Currency Toggle Button
  const currencyBtn = document.getElementById('currency-toggle-btn');
  if (currencyBtn) {
    currencyBtn.textContent = (currentCurrency === 'BDT') ? 'BDT (৳)' : 'USD ($)';
    currencyBtn.addEventListener('click', () => {
      currentCurrency = (currentCurrency === 'BDT') ? 'USD' : 'BDT';
      currencyBtn.textContent = (currentCurrency === 'BDT') ? 'BDT (৳)' : 'USD ($)';
      updateUserBalanceDisplay();

      // Refresh Category & Service dropdown options to show updated BDT/USD rates
      const currentCat = document.getElementById('category-select').value;
      const currentSrvId = document.getElementById('service-select').value;
      filterCategoriesAndServices();
      if (currentCat && categoriesData[currentCat]) {
        document.getElementById('category-select').value = currentCat;
        populateServicesDropdown(currentCat);
        if (currentSrvId) {
          document.getElementById('service-select').value = currentSrvId;
          onServiceSelect(currentSrvId);
        }
      }

      if (selectedServiceObj) {
        updateServiceDetailsDisplay(selectedServiceObj);
        calculateTotalCharge();
      }
      renderServicesTable(allServicesData);
      if (currentUser && currentUser.role === 'admin') {
        fetchAdminUsers();
        fetchAdminProviderData();
      }
      showToast(`Currency changed to ${currentCurrency}`, 'info');
    });
  }

  // Platform Filter Pills
  const platformPills = document.querySelectorAll('.platform-pill');
  platformPills.forEach(pill => {
    pill.addEventListener('click', () => {
      platformPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      currentPlatformFilter = pill.getAttribute('data-platform');
      filterCategoriesAndServices();
    });
  });

  // Category & Service Selector
  document.getElementById('category-select').addEventListener('change', (e) => {
    populateServicesDropdown(e.target.value);
  });
  document.getElementById('service-select').addEventListener('change', (e) => {
    onServiceSelect(e.target.value);
  });

  // Search Filter
  document.getElementById('search-input-field').addEventListener('input', filterCategoriesAndServices);

  // Quantity Change Event
  document.getElementById('input-quantity').addEventListener('input', calculateTotalCharge);

  // Form Submits
  document.getElementById('order-form').addEventListener('submit', handleOrderSubmit);
  document.getElementById('deposit-form').addEventListener('submit', handleDepositSubmit);
});

// One-Click Copy Payment Number Helper
window.copyPaymentNumber = function(number, method) {
  navigator.clipboard.writeText(number).then(() => {
    showToast(`Copied ${method}: ${number}`, 'info');
  }).catch(() => {
    showToast(`Copy failed`, 'error');
  });
};

// Show / Hide Auth Overlay
function showAuthOverlay(show) {
  const overlay = document.getElementById('auth-modal-overlay');
  const mainWrapper = document.getElementById('app-main-wrapper');
  if (show) {
    overlay.style.display = 'flex';
    mainWrapper.style.opacity = '0.1';
    mainWrapper.style.pointerEvents = 'none';
  } else {
    overlay.style.display = 'none';
    mainWrapper.style.opacity = '1';
    mainWrapper.style.pointerEvents = 'auto';
  }
}

// Toggle Login / Register
window.toggleAuthView = function(view, e) {
  if (e && e.preventDefault) e.preventDefault();
  const loginView = document.getElementById('auth-login-view');
  const regView = document.getElementById('auth-register-view');
  if (view === 'register') {
    loginView.style.display = 'none';
    regView.style.display = 'block';
  } else {
    loginView.style.display = 'block';
    regView.style.display = 'none';
  }
};

// Login Submit
async function handleLoginSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success && data.user) {
      currentUser = data.user;
      sessionStorage.setItem('smm_current_user', JSON.stringify(currentUser));
      showToast(`Welcome back, ${currentUser.name}!`, 'success');
      initAuthenticatedApp();
    } else {
      showToast(data.error || 'Login failed', 'error');
    }
  } catch (err) {
    showToast('Server error during login', 'error');
  }
}

// Register Submit
async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();
  const password = document.getElementById('reg-password').value;

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, username, email, phone, password })
    });
    const data = await res.json();

    if (data.success && data.user) {
      currentUser = data.user;
      sessionStorage.setItem('smm_current_user', JSON.stringify(currentUser));
      showToast('Account registered successfully!', 'success');
      initAuthenticatedApp();
    } else {
      showToast(data.error || 'Registration failed', 'error');
    }
  } catch (err) {
    showToast('Server error during registration', 'error');
  }
}

// Logout
function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem('smm_current_user');
  showToast('Logged out successfully', 'info');
  showAuthOverlay(true);
}

// Initialize Dashboard based on User Role
function initAuthenticatedApp() {
  showAuthOverlay(false);

  // Update UI user badges
  document.getElementById('sidebar-user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('header-user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('sidebar-user-name').textContent = currentUser.username;
  document.getElementById('card-username').textContent = currentUser.username;
  document.getElementById('dash-user-name').textContent = currentUser.name;

  const userNav = document.getElementById('user-sidebar-nav');
  const adminNav = document.getElementById('admin-sidebar-nav');
  const userStatGrid = document.getElementById('user-top-stat-grid');
  const userPlatformPills = document.getElementById('user-platform-pills-row');

  if (currentUser.role === 'admin') {
    userNav.style.display = 'none';
    adminNav.style.display = 'flex';
    userStatGrid.style.display = 'none';
    userPlatformPills.style.display = 'none';

    switchToTab('tab-admin-overview');
    fetchAdminUsers();
    fetchAdminDeposits();
    fetchAdminProviderData();
    fetchAdminAllOrders();
    fetchAdminRecycleBinUsers();
  } else {
    userNav.style.display = 'flex';
    adminNav.style.display = 'none';
    userStatGrid.style.display = 'grid';
    userPlatformPills.style.display = 'flex';

    switchToTab('tab-new-order');
    fetchLatestUserData();
    fetchServices();
    fetchOrdersHistory();
    fetchMyDeposits();
  }
}

// Fetch latest user data
async function fetchLatestUserData() {
  if (!currentUser) return;
  try {
    const res = await fetch(`/api/auth/me/${currentUser.id}`);
    const updatedUser = await res.json();
    if (updatedUser && updatedUser.id) {
      currentUser = updatedUser;
      sessionStorage.setItem('smm_current_user', JSON.stringify(currentUser));
      updateUserBalanceDisplay();
    }
  } catch (err) {
    console.error(err);
  }
}

// Update User Balance Display
function updateUserBalanceDisplay() {
  if (!currentUser) return;
  const balanceEl = document.getElementById('card-balance');
  const spendingEl = document.getElementById('card-spending');
  if (balanceEl) balanceEl.textContent = formatPrice(currentUser.balance);
  if (spendingEl) spendingEl.textContent = formatPrice(currentUser.spending);
}

// Format Price Helper (1 USD = 127 BDT)
function formatPrice(usdAmount) {
  const amount = parseFloat(usdAmount) || 0;
  if (currentCurrency === 'BDT') {
    const bdt = amount * BDT_CONVERSION_RATE;
    return `৳${bdt.toFixed(2)} BDT`;
  }
  return `$${amount.toFixed(4)} USD`;
}

// Admin Specific Dual Format (Shows exact USD and 127 BDT equivalent)
function formatAdminDualBalance(usdAmount) {
  const amount = parseFloat(usdAmount) || 0;
  const bdt = amount * BDT_CONVERSION_RATE;
  return `$${amount.toFixed(4)} USD (৳${bdt.toFixed(2)} BDT)`;
}

// Toast Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-item';

  let iconName = 'check-circle';
  let iconColor = 'var(--success)';
  if (type === 'error') {
    iconName = 'alert-circle';
    iconColor = 'var(--danger)';
  } else if (type === 'info') {
    iconName = 'info';
    iconColor = 'var(--cyan-accent)';
  }

  toast.innerHTML = `<i data-lucide="${iconName}" style="color: ${iconColor}; width: 16px; height: 16px;"></i> <span>${message}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Switch Active Tab Pane
window.switchToTab = function(tabId) {
  const navLinks = document.querySelectorAll('.nav-link');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navLinks.forEach(link => {
    if (link.getAttribute('data-tab') === tabId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  tabPanes.forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  if (tabId.startsWith('tab-admin') && currentUser && currentUser.role === 'admin') {
    fetchAdminUsers();
    fetchAdminDeposits();
    fetchAdminProviderData();
    fetchAdminRecycleBinUsers();
  }

  const sidebarEl = document.getElementById('sidebar');
  const backdropEl = document.getElementById('sidebar-backdrop');
  if (sidebarEl) sidebarEl.classList.remove('open');
  if (backdropEl) backdropEl.classList.remove('active');
};

// Fetch Services Catalog
async function fetchServices() {
  try {
    const res = await fetch('/api/services');
    const data = await res.json();
    if (!data || !data.services) return;

    allServicesData = data.services;
    categoriesData = data.categories;

    filterCategoriesAndServices();
    renderServicesTable(allServicesData);
  } catch (err) {
    console.error(err);
  }
}

// Filter Categories and Services
function filterCategoriesAndServices() {
  const categorySelect = document.getElementById('category-select');
  if (!categorySelect) return;
  const searchVal = document.getElementById('search-input-field').value.toLowerCase().trim();

  categorySelect.innerHTML = '<option value="">-- Select Category --</option>';

  const filteredCategories = Object.keys(categoriesData).filter(catName => {
    const matchesPlatform = (currentPlatformFilter === 'ALL') || 
      catName.toLowerCase().includes(currentPlatformFilter.toLowerCase());
    const matchesSearch = !searchVal || catName.toLowerCase().includes(searchVal);
    return matchesPlatform && matchesSearch;
  });

  filteredCategories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = `${cat} (${categoriesData[cat].length})`;
    categorySelect.appendChild(opt);
  });

  if (filteredCategories.length > 0) {
    categorySelect.value = filteredCategories[0];
    populateServicesDropdown(filteredCategories[0]);
  } else {
    document.getElementById('service-select').disabled = true;
    document.getElementById('service-select').innerHTML = '<option value="">No categories match filter</option>';
    resetServiceDetails();
  }
}

// Populate Services Dropdown
function populateServicesDropdown(categoryName) {
  const serviceSelect = document.getElementById('service-select');
  if (!serviceSelect) return;
  serviceSelect.innerHTML = '<option value="">-- Select Service --</option>';

  if (!categoryName || !categoriesData[categoryName]) {
    serviceSelect.disabled = true;
    resetServiceDetails();
    return;
  }

  const services = categoriesData[categoryName];
  services.forEach(srv => {
    const opt = document.createElement('option');
    opt.value = srv.service;
    opt.textContent = `${srv.service} - ${srv.name} - ${formatPrice(srv.rate)}`;
    serviceSelect.appendChild(opt);
  });

  serviceSelect.disabled = false;
  if (services.length > 0) {
    serviceSelect.value = services[0].service;
    onServiceSelect(services[0].service);
  }
}

// On Service Selected
function onServiceSelect(serviceId) {
  if (!serviceId) {
    resetServiceDetails();
    return;
  }

  selectedServiceObj = allServicesData.find(s => String(s.service) === String(serviceId));
  if (!selectedServiceObj) return;

  updateServiceDetailsDisplay(selectedServiceObj);

  const qtyInput = document.getElementById('input-quantity');
  if (qtyInput) {
    const minQty = parseInt(selectedServiceObj.min) || 1000;
    const maxQty = parseInt(selectedServiceObj.max) || 10000;
    const currentVal = parseInt(qtyInput.value) || 0;

    if (currentVal <= 0 || currentVal < minQty) {
      qtyInput.value = minQty;
    }
    document.getElementById('quantity-range-hint').textContent = `Min ${minQty.toLocaleString()} - Max ${maxQty.toLocaleString()}`;
  }

  const commentsGroup = document.getElementById('field-comments-group');
  if (commentsGroup) {
    if (selectedServiceObj.type === 'Custom Comments') {
      commentsGroup.style.display = 'block';
    } else {
      commentsGroup.style.display = 'none';
    }
  }

  calculateTotalCharge();
}

// Update Details & Specs
function updateServiceDetailsDisplay(srv) {
  const titleEl = document.getElementById('detail-card-title');
  if (!titleEl) return;
  titleEl.textContent = `${srv.service} - ${srv.name} - ${formatPrice(srv.rate)}`;
  document.getElementById('example-link-text').textContent = getExampleLink(srv);

  const nameLower = (srv.name + ' ' + (srv.category || '')).toLowerCase();
  let startTime = '0 - 1 Hours';
  if (nameLower.includes('instant')) startTime = 'Instant (0-15m)';
  let speed = '1k - 5k/Day';
  let guarantee = '30 Days Refill';
  if (nameLower.includes('non drop')) guarantee = 'Non Drop / Lifetime';
  let quality = 'Real Quality';

  document.getElementById('spec-start-time').textContent = startTime;
  document.getElementById('spec-speed').textContent = speed;
  document.getElementById('spec-guarantee').textContent = guarantee;
  document.getElementById('spec-quality').textContent = quality;

  document.getElementById('detail-description-box').innerHTML = `
    <strong>⚡ Start Time:</strong> ${startTime}<br>
    <strong>🚀 Speed:</strong> ${speed}<br>
    <strong>🛡️ Guarantee:</strong> ${guarantee}<br>
    <strong>💧 Drop Rate:</strong> 100% Non-Drop<br>
    <strong>⭐️ Quality:</strong> ${quality}<br>
    <strong>🔗 Example Link:</strong> ${getExampleLink(srv)}<br><br>
    <strong style="color: var(--warning);">⚠️ Important Notes:</strong>
    <ul>
      <li>Target account must be Public.</li>
      <li>Ensure link format matches example link.</li>
    </ul>
  `;
}

function getExampleLink(srv) {
  const cat = (srv.category || srv.name).toLowerCase();
  if (cat.includes('facebook')) return 'https://www.facebook.com/username_or_post/';
  if (cat.includes('instagram')) return 'https://www.instagram.com/p/post_id/';
  if (cat.includes('youtube')) return 'https://www.youtube.com/watch?v=video_id';
  if (cat.includes('tiktok')) return 'https://www.tiktok.com/@username/video/id';
  return 'https://www.example.com/target_link';
}

function resetServiceDetails() {
  selectedServiceObj = null;
  const titleEl = document.getElementById('detail-card-title');
  if (titleEl) titleEl.textContent = 'Select a Service to View Details';
  const chargeEl = document.getElementById('input-charge-display');
  if (chargeEl) chargeEl.value = '৳0.00 BDT';
}

// Calculate Total Charge
function calculateTotalCharge() {
  if (!selectedServiceObj) return;
  const qtyInput = document.getElementById('input-quantity');
  if (!qtyInput) return;

  const qty = parseInt(qtyInput.value) || 0;
  const rate = parseFloat(selectedServiceObj.rate) || 0;
  const totalUsd = (rate / 1000) * qty;

  document.getElementById('input-charge-display').value = formatPrice(totalUsd);
}

// Handle Order Submit
async function handleOrderSubmit(e) {
  e.preventDefault();

  if (!currentUser) {
    showToast('Please log in to place an order', 'error');
    showAuthOverlay(true);
    return;
  }

  if (!selectedServiceObj) {
    showToast('Please select a service', 'error');
    return;
  }

  const link = document.getElementById('input-link').value.trim();
  const quantity = parseInt(document.getElementById('input-quantity').value);

  if (!link) {
    showToast('Link is required', 'error');
    return;
  }

  const submitBtn = document.getElementById('btn-order-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing Order...';

  try {
    const rate = parseFloat(selectedServiceObj.rate);
    const charge = ((rate / 1000) * quantity).toFixed(4);

    const payload = {
      userId: currentUser.id,
      service: selectedServiceObj.service,
      service_name: selectedServiceObj.name,
      link: link,
      quantity: quantity,
      charge: charge
    };

    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data && (data.order || data.orders)) {
      const orderId = data.order || data.orders;
      showToast(`Order Placed Successfully! Main API Order ID: #${orderId}`, 'success');

      document.getElementById('order-form').reset();
      fetchLatestUserData();
      fetchOrdersHistory();
      if (currentUser.role === 'admin') fetchAdminProviderData();
    } else {
      showToast(data.error || 'Order placement failed', 'error');
    }
  } catch (err) {
    showToast('Server error while placing order', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  }
}

// Fetch Orders History (With Realtime API Sync)
async function fetchOrdersHistory() {
  if (!currentUser) return;
  const tableBody = document.getElementById('orders-table-body');
  const cardTotalOrders = document.getElementById('card-total-orders');

  try {
    const res = await fetch(`/api/my-orders/${currentUser.id}`);
    const orders = await res.json();

    if (cardTotalOrders) cardTotalOrders.textContent = orders ? orders.length : 0;

    if (!orders || orders.length === 0) {
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No orders found</td></tr>';
      return;
    }

    if (tableBody) {
      tableBody.innerHTML = orders.map(ord => `
        <tr>
          <td><strong style="color: var(--purple-primary); font-family: monospace;">#${ord.id}</strong></td>
          <td><small style="font-weight: 600;">${ord.service_name}</small></td>
          <td><a href="${ord.link.startsWith('http') ? ord.link : '#'}" target="_blank" style="color: var(--cyan-accent); text-decoration: none;">${ord.link}</a></td>
          <td>${ord.quantity}</td>
          <td><span style="color: var(--success); font-weight: 700;">${formatPrice(ord.charge)}</span></td>
          <td>${getStatusBadgeHTML(ord.status)}</td>
          <td><small style="color: var(--text-muted);">${ord.date}</small></td>
          <td><button class="badge-btn" onclick="checkOrderStatus('${ord.id}')">Check Status</button></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// Handle User Deposit Submit
async function handleDepositSubmit(e) {
  e.preventDefault();
  if (!currentUser) return;

  const method = document.getElementById('deposit-method').value;
  const amountBdt = document.getElementById('deposit-amount-bdt').value;
  const senderNumber = document.getElementById('deposit-sender').value.trim();
  const trxId = document.getElementById('deposit-trxid').value.trim();

  try {
    const res = await fetch('/api/deposit/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        method,
        senderNumber,
        trxId,
        amountBdt
      })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Deposit request submitted! Admin will approve shortly.', 'success');
      document.getElementById('deposit-form').reset();
      fetchMyDeposits();
    } else {
      showToast(data.error || 'Failed to submit deposit', 'error');
    }
  } catch (err) {
    showToast('Server error during deposit', 'error');
  }
}

// Fetch User Deposits
async function fetchMyDeposits() {
  if (!currentUser) return;
  const tableBody = document.getElementById('my-deposits-table-body');
  try {
    const res = await fetch(`/api/deposit/my-history/${currentUser.id}`);
    const deposits = await res.json();

    if (!deposits || deposits.length === 0) {
      if (tableBody) tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No deposits yet</td></tr>';
      return;
    }

    if (tableBody) {
      tableBody.innerHTML = deposits.map(dep => `
        <tr>
          <td><strong style="font-family: monospace;">#${dep.id}</strong></td>
          <td><strong>${dep.method}</strong></td>
          <td>${dep.sender_number}</td>
          <td><code style="color: var(--cyan-accent);">${dep.trx_id}</code></td>
          <td>৳${dep.amount_bdt} BDT</td>
          <td>$${dep.amount_usd} USD</td>
          <td><span class="badge-btn" style="background: ${dep.status === 'Approved' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'}; color: ${dep.status === 'Approved' ? 'var(--success)' : 'var(--warning)'};">${dep.status}</span></td>
          <td><small style="color: var(--text-muted);">${dep.date}</small></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// ----------------------------------------------------
// REALTIME ADMIN CONTROL & EXACT USD + 127 BDT SYNC
// ----------------------------------------------------

// Fetch Admin Provider Live Data (Exact USD + 127 BDT)
window.fetchAdminProviderData = async function() {
  if (!currentUser || currentUser.role !== 'admin') return;

  const liveBalEl = document.getElementById('admin-live-provider-bal');
  const statBalEl = document.getElementById('admin-stat-provider-balance');
  const liveServicesEl = document.getElementById('admin-live-provider-services');

  try {
    const res = await fetch('/api/balance');
    const data = await res.json();

    if (data && data.balance) {
      const balUsd = parseFloat(data.balance);
      const dualText = formatAdminDualBalance(balUsd);
      
      if (liveBalEl) liveBalEl.textContent = dualText;
      if (statBalEl) statBalEl.textContent = dualText;

      currentUser.balance = balUsd;
      sessionStorage.setItem('smm_current_user', JSON.stringify(currentUser));
    }

    if (allServicesData && allServicesData.length > 0 && liveServicesEl) {
      liveServicesEl.textContent = `${allServicesData.length} Services`;
    }
  } catch (err) {
    console.error('Fetch provider balance error:', err);
  }
};

// Fetch Active Admin Users List
async function fetchAdminUsers() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const tableBody = document.getElementById('admin-users-table-body');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/admin/users');
    const users = await res.json();

    const statUsers = document.getElementById('admin-stat-users');
    if (statUsers) statUsers.textContent = users.length;

    const totalBalanceUsd = users.reduce((acc, u) => acc + (parseFloat(u.balance) || 0), 0);
    const statBal = document.getElementById('admin-stat-balances');
    if (statBal) statBal.textContent = formatAdminDualBalance(totalBalanceUsd);

    tableBody.innerHTML = users.map(u => `
      <tr>
        <td><small style="font-family: monospace;">${u.id}</small></td>
        <td><strong>${u.name}</strong> <br><small style="color: var(--purple-primary);">@${u.username}</small></td>
        <td>${u.email}</td>
        <td>${u.phone || 'N/A'}</td>
        <td><strong style="color: var(--success); font-family: monospace;">${u.role === 'admin' ? formatAdminDualBalance(u.balance) : formatPrice(u.balance)}</strong></td>
        <td>${formatPrice(u.spending || 0)}</td>
        <td><span class="badge-btn">${u.role}</span></td>
        <td>
          <button class="badge-btn" style="background: var(--purple-primary); color: #fff; margin-right: 4px;" onclick="openAdminBalanceModal('${u.id}', '${u.username}', ${u.balance})">
            Edit Balance
          </button>
          ${u.role !== 'admin' ? `
            <button class="badge-btn" style="background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3);" onclick="deleteUserToTrash('${u.id}')">
              Move to Trash
            </button>
          ` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// Fetch Admin Recycle Bin Users
window.fetchAdminRecycleBinUsers = async function() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const tableBody = document.getElementById('admin-recycle-table-body');
  const trashStatEl = document.getElementById('admin-stat-trash-count');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/admin/recycle-bin');
    const trashUsers = await res.json();

    if (trashStatEl) trashStatEl.textContent = trashUsers.length;

    if (!trashUsers || trashUsers.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--text-muted);">Recycle bin is empty</td></tr>';
      return;
    }

    tableBody.innerHTML = trashUsers.map(u => `
      <tr>
        <td><small style="font-family: monospace;">${u.id}</small></td>
        <td><strong>${u.name}</strong> <br><small style="color: var(--purple-primary);">@${u.username}</small></td>
        <td>${u.email}</td>
        <td><strong style="color: var(--success); font-family: monospace;">${formatPrice(u.balance)}</strong></td>
        <td><small style="color: #f87171;">${u.deleted_at || 'Recently'}</small></td>
        <td>
          <button class="badge-btn" style="background: var(--success); color: #fff; margin-right: 4px;" onclick="restoreUserFromTrash('${u.id}')">
            Restore (পুনরুদ্ধার)
          </button>
          <button class="badge-btn" style="background: var(--danger); color: #fff;" onclick="permanentlyDeleteUser('${u.id}')">
            Delete Permanently (মুছে ফেলুন)
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
};

// Soft Delete User
window.deleteUserToTrash = async function(userId) {
  if (!confirm('Are you sure you want to move this user to the Recycle Bin?')) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('User moved to Recycle Bin!', 'info');
      fetchAdminUsers();
      fetchAdminRecycleBinUsers();
    } else {
      showToast(data.error || 'Failed to delete user', 'error');
    }
  } catch (err) {
    showToast('Error deleting user', 'error');
  }
};

// Restore User
window.restoreUserFromTrash = async function(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/restore`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast('User account restored successfully!', 'success');
      fetchAdminUsers();
      fetchAdminRecycleBinUsers();
    } else {
      showToast(data.error || 'Failed to restore user', 'error');
    }
  } catch (err) {
    showToast('Error restoring user', 'error');
  }
};

// Permanently Delete User
window.permanentlyDeleteUser = async function(userId) {
  if (!confirm('⚠️ WARNING: This will PERMANENTLY erase this user account! Proceed?')) return;
  try {
    const res = await fetch(`/api/admin/users/${userId}/permanent`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('User account PERMANENTLY deleted!', 'warning');
      fetchAdminRecycleBinUsers();
    } else {
      showToast(data.error || 'Failed to permanently delete user', 'error');
    }
  } catch (err) {
    showToast('Error permanently deleting user', 'error');
  }
};

// Fetch Admin Deposits List
async function fetchAdminDeposits() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const tableBody = document.getElementById('admin-deposits-table-body');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/admin/deposits');
    const deposits = await res.json();

    const pendingCount = deposits.filter(d => d.status === 'Pending').length;
    const statDep = document.getElementById('admin-stat-deposits');
    if (statDep) statDep.textContent = pendingCount;

    if (!deposits || deposits.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; color: var(--text-muted);">No deposit requests found</td></tr>';
      return;
    }

    tableBody.innerHTML = deposits.map(dep => `
      <tr>
        <td><strong>@${dep.username}</strong></td>
        <td><strong>${dep.method}</strong></td>
        <td>${dep.sender_number}</td>
        <td><code style="color: var(--cyan-accent);">${dep.trx_id}</code></td>
        <td>৳${dep.amount_bdt} BDT</td>
        <td><strong style="color: var(--success);">$${dep.amount_usd} USD</strong></td>
        <td><span class="badge-btn" style="background: ${dep.status === 'Approved' ? 'rgba(16,185,129,0.15)' : (dep.status === 'Rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)')}; color: ${dep.status === 'Approved' ? 'var(--success)' : (dep.status === 'Rejected' ? 'var(--danger)' : 'var(--warning)')};">${dep.status}</span></td>
        <td><small>${dep.date}</small></td>
        <td>
          ${dep.status === 'Pending' ? `
            <button class="badge-btn" style="background: var(--success); color: #fff; margin-right: 2px;" onclick="approveDeposit('${dep.id}')">Approve</button>
          ` : ''}
          ${dep.status !== 'Rejected' ? `
            <button class="badge-btn" style="background: rgba(245,158,11,0.2); color: var(--warning); border-color: rgba(245,158,11,0.4); margin-right: 2px;" onclick="rejectDeposit('${dep.id}')">Reject</button>
          ` : ''}
          <button class="badge-btn" style="background: rgba(239,68,68,0.2); color: #f87171; border-color: rgba(239,68,68,0.4);" onclick="deleteDepositHistory('${dep.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// Delete Deposit History Record
window.deleteDepositHistory = async function(depositId) {
  if (!confirm('Are you sure you want to PERMANENTLY delete this deposit history record?')) return;
  try {
    const res = await fetch(`/api/admin/deposits/${depositId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Deposit history record deleted!', 'info');
      fetchAdminDeposits();
    } else {
      showToast(data.error || 'Failed to delete deposit record', 'error');
    }
  } catch (err) {
    showToast('Error deleting deposit record', 'error');
  }
};

function getStatusBadgeHTML(status) {
  const st = (status || 'Pending').toLowerCase();
  if (st === 'completed') {
    return `<span class="badge-btn" style="background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); font-weight:700;">Completed</span>`;
  } else if (st === 'processing') {
    return `<span class="badge-btn" style="background: rgba(6,182,212,0.15); color: #06b6d4; border: 1px solid rgba(6,182,212,0.3); font-weight:700;">Processing</span>`;
  } else if (st.includes('progress')) {
    return `<span class="badge-btn" style="background: rgba(139,92,246,0.15); color: #a855f7; border: 1px solid rgba(139,92,246,0.3); font-weight:700;">In Progress</span>`;
  } else if (st === 'pending') {
    return `<span class="badge-btn" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); font-weight:700;">Pending</span>`;
  } else if (st === 'partial') {
    return `<span class="badge-btn" style="background: rgba(249,115,22,0.15); color: #f97316; border: 1px solid rgba(249,115,22,0.3); font-weight:700;">Partial</span>`;
  } else if (st.includes('cancel') || st.includes('refund')) {
    return `<span class="badge-btn" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); font-weight:700;">${status}</span>`;
  }
  return `<span class="badge-btn" style="background: rgba(139,92,246,0.15); color: #a855f7; font-weight:700;">${status}</span>`;
}

// Fetch All Users Orders for Admin
window.fetchAdminAllOrders = async function() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const tableBody = document.getElementById('admin-orders-table-body');
  if (!tableBody) return;

  try {
    const res = await fetch('/api/admin/orders');
    const orders = await res.json();

    if (!orders || orders.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; color: var(--text-muted);">No orders found across all users</td></tr>';
      return;
    }

    tableBody.innerHTML = orders.map(ord => `
      <tr>
        <td><strong style="color: var(--purple-primary); font-family: monospace;">#${ord.id}</strong></td>
        <td><strong>@${ord.username || 'User'}</strong></td>
        <td><small style="font-weight: 600;">${ord.service_name}</small></td>
        <td><a href="${ord.link.startsWith('http') ? ord.link : '#'}" target="_blank" style="color: var(--cyan-accent); text-decoration: none;">${ord.link}</a></td>
        <td>${ord.quantity}</td>
        <td><span style="color: var(--success); font-weight: 700;">$${ord.charge} USD</span></td>
        <td>${getStatusBadgeHTML(ord.status)}</td>
        <td><small style="color: var(--text-muted);">${ord.date}</small></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
};

// Admin Balance Modal Controls
window.openAdminBalanceModal = function(userId, username, currentBalance) {
  document.getElementById('edit-user-id').value = userId;
  document.getElementById('edit-user-username').value = username;
  document.getElementById('edit-user-new-balance').value = currentBalance;
  document.getElementById('admin-balance-modal').style.display = 'flex';
};

window.closeAdminBalanceModal = function() {
  document.getElementById('admin-balance-modal').style.display = 'none';
};

window.submitAdminBalanceEdit = async function() {
  const userId = document.getElementById('edit-user-id').value;
  const newBalance = document.getElementById('edit-user-new-balance').value;

  try {
    const res = await fetch('/api/admin/users/update-balance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newBalance })
    });
    const data = await res.json();

    if (data.success) {
      showToast('User balance updated successfully!', 'success');
      closeAdminBalanceModal();
      fetchAdminUsers();
    } else {
      showToast(data.error || 'Failed to update balance', 'error');
    }
  } catch (err) {
    showToast('Error updating balance', 'error');
  }
};

// Admin Approve Deposit
window.approveDeposit = async function(depositId) {
  try {
    const res = await fetch('/api/admin/deposits/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId })
    });
    const data = await res.json();

    if (data.success) {
      showToast('Deposit Approved & User Balance Credited!', 'success');
      fetchAdminDeposits();
      fetchAdminUsers();
    } else {
      showToast(data.error || 'Approval failed', 'error');
    }
  } catch (err) {
    showToast('Error approving deposit', 'error');
  }
};

// Admin Reject Deposit
window.rejectDeposit = async function(depositId) {
  try {
    const res = await fetch('/api/admin/deposits/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depositId })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Deposit request rejected', 'info');
      fetchAdminDeposits();
    }
  } catch (err) {
    showToast('Error rejecting deposit', 'error');
  }
};

function getPlatformBadgeHTML(text) {
  const str = (text || '').toLowerCase();
  if (str.includes('instagram') || str.includes('ig')) {
    return `<span class="platform-icon-badge instagram-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-instagram"></i></span>`;
  } else if (str.includes('facebook') || str.includes('fb')) {
    return `<span class="platform-icon-badge facebook-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-facebook-f"></i></span>`;
  } else if (str.includes('youtube') || str.includes('yt')) {
    return `<span class="platform-icon-badge youtube-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-youtube"></i></span>`;
  } else if (str.includes('tiktok')) {
    return `<span class="platform-icon-badge tiktok-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-tiktok"></i></span>`;
  } else if (str.includes('telegram') || str.includes('tg')) {
    return `<span class="platform-icon-badge telegram-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-telegram"></i></span>`;
  } else if (str.includes('twitter') || str.includes('x ')) {
    return `<span class="platform-icon-badge twitter-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-x-twitter"></i></span>`;
  } else if (str.includes('spotify')) {
    return `<span class="platform-icon-badge spotify-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-spotify"></i></span>`;
  } else if (str.includes('linkedin')) {
    return `<span class="platform-icon-badge linkedin-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-linkedin-in"></i></span>`;
  } else if (str.includes('snapchat')) {
    return `<span class="platform-icon-badge snapchat-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-snapchat"></i></span>`;
  } else if (str.includes('soundcloud')) {
    return `<span class="platform-icon-badge soundcloud-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-brands fa-soundcloud"></i></span>`;
  } else if (str.includes('traffic') || str.includes('web')) {
    return `<span class="platform-icon-badge traffic-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-solid fa-globe"></i></span>`;
  }
  return `<span class="platform-icon-badge default-badge" style="width:20px;height:20px;font-size:10px;margin-right:6px;display:inline-flex;vertical-align:middle;"><i class="fa-solid fa-bolt"></i></span>`;
}

// Render Services Table
function renderServicesTable(servicesList) {
  const tableBody = document.getElementById('services-table-body');
  if (!tableBody || !servicesList) return;

  const displayList = servicesList.slice(0, 150);

  tableBody.innerHTML = displayList.map(srv => `
    <tr>
      <td><strong style="color: var(--purple-primary); font-family: monospace;">#${srv.service}</strong></td>
      <td>${getPlatformBadgeHTML(srv.category)} <small style="color: var(--text-muted); font-weight: 600;">${srv.category || 'General'}</small></td>
      <td><strong>${srv.name}</strong></td>
      <td><span style="color: var(--success); font-weight: 700;">${formatPrice(srv.rate)}</span> / 1k</td>
      <td><small>${srv.min} - ${srv.max}</small></td>
      <td>
        <button class="badge-btn" onclick="quickOrderService('${srv.service}', '${escapeHtml(srv.category || '')}')">Order</button>
      </td>
    </tr>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

window.quickOrderService = function(serviceId, categoryName) {
  switchToTab('tab-new-order');
  const categorySelect = document.getElementById('category-select');
  if (categorySelect) {
    categorySelect.value = categoryName;
    populateServicesDropdown(categoryName);
    const serviceSelect = document.getElementById('service-select');
    if (serviceSelect) {
      serviceSelect.value = serviceId;
      onServiceSelect(serviceId);
    }
  }
};

window.checkOrderStatus = async function(orderId) {
  try {
    showToast(`Checking realtime status for Order #${orderId}...`, 'info');
    const res = await fetch('/api/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId })
    });
    const data = await res.json();
    if (data && data.status) {
      const remainsText = data.remains !== undefined ? ` (Remains: ${data.remains})` : '';
      showToast(`Order #${orderId} Realtime Status: ${data.status}${remainsText}`, 'success');
      fetchOrdersHistory();
      if (currentUser && currentUser.role === 'admin') fetchAdminAllOrders();
    } else {
      showToast(data.error || 'Unable to retrieve status', 'error');
    }
  } catch (err) {
    showToast('Failed to check status from API', 'error');
  }
};

window.copyText = function(elementId) {
  const text = document.getElementById(elementId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Link copied to clipboard!', 'info');
  });
};

function initThemeSwitcher() {
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');
  
  const savedTheme = localStorage.getItem('smm_theme') || 'dark';
  applyTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(newTheme);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smm_theme', theme);
    if (themeIcon) {
      if (theme === 'light') {
        themeIcon.className = 'fa-solid fa-sun';
        themeIcon.style.color = '#f59e0b';
      } else {
        themeIcon.className = 'fa-solid fa-moon';
        themeIcon.style.color = '#a855f7';
      }
    }
  }
}

// ----------------------------------------------------
// MASS ORDER HANDLER
// ----------------------------------------------------
window.handleMassOrderSubmit = async function() {
  if (!currentUser) {
    showToast('Please log in to submit mass orders', 'error');
    showAuthOverlay(true);
    return;
  }

  const massInput = document.getElementById('mass-order-input');
  if (!massInput) return;
  const massData = massInput.value.trim();

  if (!massData) {
    showToast('Please enter mass order data', 'error');
    return;
  }

  try {
    showToast('Processing mass orders...', 'info');
    const res = await fetch('/api/mass-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        massData: massData
      })
    });
    const data = await res.json();

    if (data.success && data.results) {
      let successCount = 0;
      let failCount = 0;
      data.results.forEach(r => {
        if (r.status === 'Success') successCount++;
        else failCount++;
      });

      if (successCount > 0) {
        showToast(`Mass Orders Placed! ${successCount} Successful, ${failCount} Failed`, 'success');
        massInput.value = '';
        fetchLatestUserData();
        fetchOrdersHistory();
        if (currentUser.role === 'admin') fetchAdminAllOrders();
      } else {
        showToast(`Mass Order Failed! ${failCount} errors found. Check format (service_id | link | quantity)`, 'error');
      }
    } else {
      showToast(data.error || 'Mass order submission failed', 'error');
    }
  } catch (err) {
    showToast('Server error while submitting mass orders', 'error');
  }
};

// ----------------------------------------------------
// REALTIME AUTO-REFRESH POLLING (10 SECONDS INTERVAL)
// ----------------------------------------------------
setInterval(() => {
  if (currentUser) {
    if (currentUser.role === 'admin') {
      fetchAdminUsers();
      fetchAdminDeposits();
      fetchAdminProviderData();
      fetchAdminAllOrders();
      fetchAdminRecycleBinUsers();
    } else {
      fetchLatestUserData();
    }
  }
}, 10000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser) {
    if (currentUser.role === 'admin') {
      fetchAdminUsers();
      fetchAdminDeposits();
      fetchAdminProviderData();
    } else {
      fetchLatestUserData();
    }
  }
});

