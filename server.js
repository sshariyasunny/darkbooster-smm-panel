const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const db = require('./db');
const telegramBot = require('./telegramBot');

const { getUsers, saveUsers, getDeposits, saveDeposits, getOrders, saveOrders, deleteUserFromMongoDB, deleteDepositFromMongoDB, deleteOrderFromMongoDB, defaultAdmin } = db;

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.SMM_API_URL || 'https://bestfollows.com/api/v2';
const API_KEY = process.env.SMM_API_KEY || '5c5315c5a80c0758b866af2b5f6c40af';
const BDT_EXCHANGE_RATE = 127.0; // 1 USD = 127 BDT

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Health & Ping route for Render hosting and 24/7 uptime pinging
app.get(['/health', '/ping'], (req, res) => {
  res.status(200).json({
    status: 'online',
    message: 'Server and Telegram Bot are running 24/7',
    timestamp: new Date().toISOString()
  });
});


// SMM Provider API Connector (bestfollows.com/api/v2)
async function callSmmApi(payload) {
  try {
    const params = new URLSearchParams({ key: API_KEY, ...payload });
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    if (!response.ok) {
      return { error: `Provider API HTTP error status: ${response.status}` };
    }
    return await response.json();
  } catch (err) {
    console.error('callSmmApi error:', err.message);
    return { error: 'Failed to connect to SMM API provider' };
  }
}

// Sync Admin user balance with live SMM Provider balance
async function syncAdminLiveBalance() {
  try {
    const data = await callSmmApi({ action: 'balance' });
    if (data && data.balance) {
      const liveBal = parseFloat(data.balance);
      const users = getUsers();
      const adminIndex = users.findIndex(u => u.role === 'admin' || u.username === 'admin');
      if (adminIndex !== -1 && users[adminIndex].balance !== liveBal) {
        users[adminIndex].balance = liveBal;
        saveUsers(users);
      }
      return liveBal;
    }
  } catch (err) {
    console.error('Sync admin live balance error:', err.message);
  }
  return null;
}

// ----------------------------------------------------
// DEPOSIT APPROVAL & REJECTION HELPERS (Shared with Telegram Bot)
// ----------------------------------------------------
function approveDeposit(depositId) {
  const deposits = getDeposits();
  const depIndex = deposits.findIndex(d => d.id === depositId);

  if (depIndex === -1) {
    return { success: false, error: 'Deposit request not found' };
  }

  const deposit = deposits[depIndex];
  if (deposit.status === 'Approved') {
    return { success: false, error: 'Deposit request is already approved' };
  }

  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === deposit.user_id);
  if (userIndex !== -1) {
    users[userIndex].balance += deposit.amount_usd;
    saveUsers(users);
  }

  deposits[depIndex].status = 'Approved';
  saveDeposits(deposits);

  return { success: true, deposit: deposits[depIndex] };
}

function rejectDeposit(depositId) {
  const deposits = getDeposits();
  const depIndex = deposits.findIndex(d => d.id === depositId);

  if (depIndex === -1) {
    return { success: false, error: 'Deposit request not found' };
  }

  deposits[depIndex].status = 'Rejected';
  saveDeposits(deposits);

  return { success: true, deposit: deposits[depIndex] };
}

// Bind Telegram Bot Action Handlers & Bot Commands
telegramBot.setHandlers({
  onApproveDeposit: async (depositId) => {
    return approveDeposit(depositId);
  },
  onRejectDeposit: async (depositId) => {
    return rejectDeposit(depositId);
  },
  getStats: async () => {
    const users = getUsers().filter(u => !u.is_deleted);
    const deposits = getDeposits();
    const approvedDeps = deposits.filter(d => d.status === 'Approved');
    const pendingDeps = deposits.filter(d => d.status === 'Pending');
    const orders = getOrders();
    const liveBal = await syncAdminLiveBalance();

    const totalDepositedUsd = approvedDeps.reduce((sum, d) => sum + (d.amount_usd || 0), 0);
    const totalDepositedBdt = approvedDeps.reduce((sum, d) => sum + (d.amount_bdt || 0), 0);

    return {
      totalUsers: users.length,
      totalDeposits: deposits.length,
      pendingDeposits: pendingDeps.length,
      totalDepositedUsd,
      totalDepositedBdt,
      totalOrders: orders.length,
      providerBalance: liveBal
    };
  },
  getPendingDeposits: async () => {
    return getDeposits().filter(d => d.status === 'Pending');
  },
  getUsers: async () => {
    return getUsers().filter(u => !u.is_deleted).map(({ password, ...u }) => u);
  },
  getBalance: async () => {
    return await callSmmApi({ action: 'balance' });
  }
});

// ----------------------------------------------------
// AUTHENTICATION API ROUTES
// ----------------------------------------------------

// Register
app.post('/api/auth/register', (req, res) => {
  const { name, username, email, phone, password } = req.body;
  if (!name || !username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const users = getUsers();
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    name: name,
    username: username.toLowerCase().trim(),
    email: email.toLowerCase().trim(),
    phone: phone || '',
    password: password,
    balance: 0.0,
    spending: 0.0,
    role: 'user',
    is_deleted: false,
    created_at: new Date().toLocaleString()
  };

  users.push(newUser);
  saveUsers(users);

  // Send real-time Telegram notification to Admin
  telegramBot.sendNewUserNotification(newUser).catch(err => {
    console.error('Telegram user alert error:', err.message);
  });

  const { password: _, ...userSafe } = newUser;
  res.json({ success: true, user: userSafe });
});

// Login (Syncs Admin live provider balance on admin login)
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // If Admin login, sync live provider balance first
  if (username.toLowerCase() === 'admin' || username.toLowerCase() === 'admin@darkbooster.com') {
    await syncAdminLiveBalance();
  }

  const users = getUsers();
  const user = users.find(u => 
    (u.username.toLowerCase() === username.toLowerCase() || u.email.toLowerCase() === username.toLowerCase()) && 
    u.password === password
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (user.is_deleted) {
    return res.status(403).json({ error: 'Account suspended/deleted. Contact Admin.' });
  }

  const { password: _, ...userSafe } = user;
  res.json({ success: true, user: userSafe });
});

// Get Current User Info
app.get('/api/auth/me/:userId', async (req, res) => {
  if (req.params.userId === 'usr_admin') {
    await syncAdminLiveBalance();
  }
  const users = getUsers();
  const user = users.find(u => u.id === req.params.userId && !u.is_deleted);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  const { password: _, ...userSafe } = user;
  res.json(userSafe);
});

// ----------------------------------------------------
// DEPOSIT / ADD FUNDS ROUTES
// ----------------------------------------------------

// User Submit Deposit Request
app.post('/api/deposit/request', (req, res) => {
  const { userId, method, senderNumber, trxId, amountBdt } = req.body;
  if (!userId || !method || !trxId || !amountBdt) {
    return res.status(400).json({ error: 'Missing required deposit fields' });
  }

  const users = getUsers();
  const user = users.find(u => u.id === userId && !u.is_deleted);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const amountUsd = parseFloat(amountBdt) / BDT_EXCHANGE_RATE;

  const newDeposit = {
    id: 'dep_' + Date.now(),
    user_id: user.id,
    username: user.username,
    method: method,
    sender_number: senderNumber || 'N/A',
    trx_id: trxId,
    amount_bdt: parseFloat(amountBdt),
    amount_usd: parseFloat(amountUsd.toFixed(4)),
    status: 'Pending',
    date: new Date().toLocaleString()
  };

  const deposits = getDeposits();
  deposits.unshift(newDeposit);
  saveDeposits(deposits);

  // Send real-time Telegram alert with inline Approve/Reject buttons
  telegramBot.sendDepositNotification(newDeposit).then(msgId => {
    if (msgId) {
      const deps = getDeposits();
      const depIndex = deps.findIndex(d => d.id === newDeposit.id);
      if (depIndex !== -1) {
        deps[depIndex].telegram_msg_id = msgId;
        saveDeposits(deps);
      }
    }
  }).catch(err => {
    console.error('Telegram deposit alert error:', err.message);
  });

  res.json({ success: true, deposit: newDeposit });
});

// Get User Deposit History
app.get('/api/deposit/my-history/:userId', (req, res) => {
  const deposits = getDeposits();
  const userDeposits = deposits.filter(d => d.user_id === req.params.userId);
  res.json(userDeposits);
});

// ----------------------------------------------------
// ADMIN CONTROL ROUTES & REALTIME BALANCE SYNC
// ----------------------------------------------------

// Admin: Get All Users (Realtime sync for admin balance)
app.get('/api/admin/users', async (req, res) => {
  await syncAdminLiveBalance();
  const users = getUsers();
  const activeUsers = users.filter(u => u.is_deleted !== true).map(({ password, ...u }) => u);
  res.json(activeUsers);
});

// Admin: Get Recycle Bin Users
app.get('/api/admin/recycle-bin', (req, res) => {
  const users = getUsers();
  const trashUsers = users.filter(u => u.is_deleted === true).map(({ password, ...u }) => u);
  res.json(trashUsers);
});

// Admin: Edit User Balance
app.post('/api/admin/users/update-balance', (req, res) => {
  const { userId, newBalance, action, amount, mode, currency } = req.body;
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const exchangeRate = BDT_EXCHANGE_RATE || 127.0;

  let valInUsd = 0;
  if (amount !== undefined && amount !== null && amount !== '' && !isNaN(parseFloat(amount))) {
    const numAmt = parseFloat(amount);
    valInUsd = (currency === 'BDT') ? (numAmt / exchangeRate) : numAmt;
  } else if (newBalance !== undefined && newBalance !== null && newBalance !== '' && !isNaN(parseFloat(newBalance))) {
    const numBal = parseFloat(newBalance);
    valInUsd = (currency === 'BDT') ? (numBal / exchangeRate) : numBal;
  }

  const currentBal = parseFloat(users[userIndex].balance) || 0;
  const actMode = mode || action || 'set';

  if (actMode === 'add') {
    users[userIndex].balance = Math.max(0, currentBal + valInUsd);
  } else if (actMode === 'subtract') {
    users[userIndex].balance = Math.max(0, currentBal - valInUsd);
  } else {
    // 'set'
    users[userIndex].balance = Math.max(0, valInUsd);
  }

  users[userIndex].balance = parseFloat(users[userIndex].balance.toFixed(4));

  saveUsers(users);
  const { password: _, ...userSafe } = users[userIndex];
  res.json({ success: true, user: userSafe, newBalanceUsd: users[userIndex].balance });
});

// Admin: Soft Delete User
app.delete('/api/admin/users/:userId', (req, res) => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (users[userIndex].role === 'admin') {
    return res.status(400).json({ error: 'Cannot delete primary admin user' });
  }

  users[userIndex].is_deleted = true;
  users[userIndex].deleted_at = new Date().toLocaleString();
  saveUsers(users);

  res.json({ success: true, message: 'User moved to Recycle Bin' });
});

// Admin: Restore User from Recycle Bin
app.post('/api/admin/users/:userId/restore', (req, res) => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === req.params.userId);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  users[userIndex].is_deleted = false;
  delete users[userIndex].deleted_at;
  saveUsers(users);

  res.json({ success: true, message: 'User account restored successfully' });
});

// Admin: Permanently Delete User
app.delete('/api/admin/users/:userId/permanent', (req, res) => {
  let users = getUsers();
  const userToDelete = users.find(u => u.id === req.params.userId);

  if (!userToDelete) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (userToDelete.role === 'admin') {
    return res.status(400).json({ error: 'Cannot delete primary admin user' });
  }

  users = users.filter(u => u.id !== req.params.userId);
  saveUsers(users);
  deleteUserFromMongoDB(req.params.userId);

  res.json({ success: true, message: 'User account permanently deleted' });
});

// Admin: Get All Deposits
app.get('/api/admin/deposits', (req, res) => {
  const deposits = getDeposits();
  res.json(deposits);
});

// Admin: Approve Deposit Request
app.post('/api/admin/deposits/approve', async (req, res) => {
  const { depositId } = req.body;
  const result = approveDeposit(depositId);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Update Telegram message status if sent
  if (result.deposit.telegram_msg_id) {
    await telegramBot.updateDepositMessageStatus(null, result.deposit.telegram_msg_id, result.deposit, 'Approved', 'Via Web Admin');
  }

  res.json({ success: true, deposit: result.deposit });
});

// Admin: Reject Deposit Request
app.post('/api/admin/deposits/reject', async (req, res) => {
  const { depositId } = req.body;
  const result = rejectDeposit(depositId);

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  // Update Telegram message status if sent
  if (result.deposit.telegram_msg_id) {
    await telegramBot.updateDepositMessageStatus(null, result.deposit.telegram_msg_id, result.deposit, 'Rejected', 'Via Web Admin');
  }

  res.json({ success: true, deposit: result.deposit });
});

// Admin: Delete Deposit History Record
app.delete('/api/admin/deposits/:depositId', (req, res) => {
  let deposits = getDeposits();
  const depExists = deposits.some(d => d.id === req.params.depositId);

  if (!depExists) {
    return res.status(404).json({ error: 'Deposit record not found' });
  }

  deposits = deposits.filter(d => d.id !== req.params.depositId);
  saveDeposits(deposits);
  deleteDepositFromMongoDB(req.params.depositId);

  res.json({ success: true, message: 'Deposit history record deleted permanently' });
});

// ----------------------------------------------------
// SMM SERVICES & ORDER ROUTES
// ----------------------------------------------------

// Get Provider Main API Balance (Syncs admin balance in real-time)
app.get('/api/balance', async (req, res) => {
  try {
    const data = await callSmmApi({ action: 'balance' });
    if (data && data.balance) {
      await syncAdminLiveBalance();
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch provider main balance', details: error.message });
  }
});

const PROFIT_MARGIN_MULTIPLIER = 1.20; // 20% profit margin added automatically to all rates

// Get Services
app.get('/api/services', async (req, res) => {
  try {
    const services = await callSmmApi({ action: 'services' });
    if (!Array.isArray(services)) {
      return res.status(400).json({ error: 'Invalid response from API provider', data: services });
    }

    // Apply 20% profit margin markup to all service rates
    const markedUpServices = services.map(service => {
      const originalRate = parseFloat(service.rate) || 0;
      const markedUpRate = (originalRate * PROFIT_MARGIN_MULTIPLIER).toFixed(4);
      return {
        ...service,
        rate: markedUpRate
      };
    });

    const categoriesMap = {};
    markedUpServices.forEach(service => {
      const cat = service.category || 'General Services';
      if (!categoriesMap[cat]) {
        categoriesMap[cat] = [];
      }
      categoriesMap[cat].push(service);
    });

    res.json({
      total: markedUpServices.length,
      categories: categoriesMap,
      services: markedUpServices
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch services', details: error.message });
  }
});

// Place Order
app.post('/api/order', async (req, res) => {
  try {
    const { userId, service, link, quantity, comments, service_name, charge } = req.body;
    if (!userId) {
      return res.status(401).json({ error: 'Please log in to place orders' });
    }

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId && !u.is_deleted);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const user = users[userIndex];
    const orderCharge = parseFloat(charge) || 0;

    if (user.role !== 'admin' && user.balance < orderCharge) {
      return res.status(400).json({ 
        error: `Insufficient balance! Needed: $${orderCharge.toFixed(4)}, Available: $${user.balance.toFixed(4)}. Please Add Funds.` 
      });
    }

    const payload = { action: 'add', service: service, link: link, quantity: quantity };
    if (comments) payload.comments = comments;

    const result = await callSmmApi(payload);

    if (result && (result.order || result.orders)) {
      const providerOrderId = result.order || (Array.isArray(result.orders) ? result.orders[0] : result.orders);

      if (user.role !== 'admin') {
        users[userIndex].balance -= orderCharge;
      }
      users[userIndex].spending += orderCharge;
      saveUsers(users);

      const newOrderRecord = {
        id: providerOrderId,
        user_id: user.id,
        username: user.username,
        service_id: service,
        service_name: service_name || `Service #${service}`,
        link: link,
        quantity: quantity,
        charge: orderCharge.toFixed(4),
        status: 'Pending',
        remains: quantity,
        date: new Date().toLocaleString()
      };

      const orders = getOrders();
      orders.unshift(newOrderRecord);
      saveOrders(orders);

      await syncAdminLiveBalance();

      return res.json({
        ...result,
        user_balance: users[userIndex].balance,
        provider_balance: result.balance || null
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Order placement failed', details: error.message });
  }
});

// Mass Order Batch Placement
app.post('/api/mass-order', async (req, res) => {
  try {
    const { userId, massData } = req.body;
    if (!userId) {
      return res.status(401).json({ error: 'Please log in to place orders' });
    }
    if (!massData || !massData.trim()) {
      return res.status(400).json({ error: 'Mass order data is required' });
    }

    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId && !u.is_deleted);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User account not found' });
    }

    // Fetch services to calculate rates
    let services = [];
    try {
      const rawServices = await callSmmApi({ action: 'services' });
      if (Array.isArray(rawServices)) {
        services = rawServices;
      }
    } catch (e) {}

    const lines = massData.trim().split('\n');
    const results = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 3) {
        results.push({ line, status: 'Error', message: 'Invalid format. Use service_id | link | quantity' });
        continue;
      }

      const serviceId = parts[0];
      const link = parts[1];
      const quantity = parseInt(parts[2]);

      if (!serviceId || !link || isNaN(quantity) || quantity <= 0) {
        results.push({ line, status: 'Error', message: 'Invalid parameters' });
        continue;
      }

      const srv = services.find(s => String(s.service) === String(serviceId));
      const originalRate = srv ? parseFloat(srv.rate) || 0 : 0;
      const rate = originalRate * PROFIT_MARGIN_MULTIPLIER;
      const orderCharge = (rate / 1000) * quantity;

      if (users[userIndex].role !== 'admin' && users[userIndex].balance < orderCharge) {
        results.push({ line, status: 'Error', message: `Insufficient balance (Need: $${orderCharge.toFixed(4)})` });
        continue;
      }

      try {
        const smmRes = await callSmmApi({ action: 'add', service: serviceId, link: link, quantity: quantity });
        if (smmRes && (smmRes.order || smmRes.orders)) {
          const providerOrderId = smmRes.order || (Array.isArray(smmRes.orders) ? smmRes.orders[0] : smmRes.orders);

          if (users[userIndex].role !== 'admin') {
            users[userIndex].balance -= orderCharge;
          }
          users[userIndex].spending += orderCharge;

          const newOrderRecord = {
            id: providerOrderId,
            user_id: users[userIndex].id,
            username: users[userIndex].username,
            service_id: serviceId,
            service_name: srv ? srv.name : `Service #${serviceId}`,
            link: link,
            quantity: quantity,
            charge: orderCharge.toFixed(4),
            status: 'Pending',
            remains: quantity,
            date: new Date().toLocaleString()
          };

          const orders = getOrders();
          orders.unshift(newOrderRecord);
          saveOrders(orders);

          results.push({ line, status: 'Success', orderId: providerOrderId, charge: orderCharge.toFixed(4) });
        } else {
          results.push({ line, status: 'Error', message: smmRes.error || 'Provider rejected order' });
        }
      } catch (err) {
        results.push({ line, status: 'Error', message: err.message });
      }
    }

    saveUsers(users);
    await syncAdminLiveBalance();

    res.json({ success: true, results, user_balance: users[userIndex].balance });
  } catch (error) {
    res.status(500).json({ error: 'Mass order processing failed', details: error.message });
  }
});

// Sync active (non-terminal) order statuses with Provider API (bestfollows.com/api/v2)
async function syncOrdersStatus(ordersToSync) {
  if (!ordersToSync || !Array.isArray(ordersToSync) || ordersToSync.length === 0) return;

  const terminalStatuses = ['completed', 'canceled', 'cancelled', 'refunded', 'canceled & refunded'];
  const activeOrders = ordersToSync.filter(o => 
    !o.is_manual && (!o.status || !terminalStatuses.includes(String(o.status).toLowerCase()))
  );

  if (activeOrders.length === 0) return;

  const orderIds = activeOrders.map(o => o.id).slice(0, 100).join(',');

  try {
    const statusData = await callSmmApi({ action: 'status', orders: orderIds });

    if (statusData && typeof statusData === 'object' && !statusData.error) {
      const allOrders = getOrders();
      let hasChanges = false;

      for (const activeOrd of activeOrders) {
        const liveInfo = statusData[activeOrd.id] || statusData[String(activeOrd.id)];
        if (liveInfo && liveInfo.status) {
          const idx = allOrders.findIndex(o => String(o.id) === String(activeOrd.id));
          if (idx !== -1 && !allOrders[idx].is_manual) {
            let newStatus = liveInfo.status;
            if (newStatus === 'In progress') newStatus = 'In Progress';
            
            const oldStatus = allOrders[idx].status;
            const newRemains = liveInfo.remains !== undefined ? liveInfo.remains : allOrders[idx].remains;
            const newStartCount = liveInfo.start_count !== undefined ? liveInfo.start_count : allOrders[idx].start_count;

            if (oldStatus !== newStatus || allOrders[idx].remains !== newRemains || allOrders[idx].start_count !== newStartCount) {
              allOrders[idx].status = newStatus;
              allOrders[idx].remains = newRemains;
              allOrders[idx].start_count = newStartCount;
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges) {
        saveOrders(allOrders);
      }
    }
  } catch (err) {
    console.error('syncOrdersStatus error:', err.message);
  }
}

// Background auto-sync for pending/in-progress orders every 30 seconds
setInterval(async () => {
  try {
    const orders = getOrders();
    await syncOrdersStatus(orders);
  } catch (e) {
    console.error('Background order status sync error:', e.message);
  }
}, 30000);

// Order Status Check
app.post('/api/status', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    const result = await callSmmApi({ action: 'status', order: order_id });

    if (result && result.status) {
      const orders = getOrders();
      const idx = orders.findIndex(o => String(o.id) === String(order_id));
      if (idx !== -1) {
        let newStatus = result.status;
        if (newStatus === 'In progress') newStatus = 'In Progress';
        orders[idx].status = newStatus;
        if (result.remains !== undefined) orders[idx].remains = result.remains;
        if (result.start_count !== undefined) orders[idx].start_count = result.start_count;
        saveOrders(orders);
      }
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Status check failed', details: error.message });
  }
});

// Get User Orders (With Realtime Provider API Sync)
app.get('/api/my-orders/:userId', async (req, res) => {
  let orders = getOrders();
  await syncOrdersStatus(orders);
  orders = getOrders();
  const userOrders = orders.filter(o => o.user_id === req.params.userId || req.params.userId === 'usr_admin');
  res.json(userOrders);
});

// Admin: Get All Orders (With Realtime Provider API Sync)
app.get('/api/admin/orders', async (req, res) => {
  let orders = getOrders();
  await syncOrdersStatus(orders);
  orders = getOrders();
  res.json(orders);
});

// Admin: Update Order Status Manually & Optional Refund
app.post('/api/admin/orders/update-status', (req, res) => {
  const { orderId, newStatus, remains, refundUser } = req.body;
  if (!orderId || !newStatus) {
    return res.status(400).json({ error: 'orderId and newStatus are required' });
  }

  const orders = getOrders();
  const orderIndex = orders.findIndex(o => String(o.id) === String(orderId));

  if (orderIndex === -1) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const order = orders[orderIndex];
  order.status = newStatus;
  order.is_manual = true; // Mark as manually set by admin to prevent auto-sync overwrite

  if (remains !== undefined && remains !== null && remains !== '') {
    order.remains = parseInt(remains) || 0;
  }

  let refundMessage = '';
  if (refundUser) {
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === order.user_id);
    if (userIndex !== -1) {
      const chargeAmount = parseFloat(order.charge) || 0;
      users[userIndex].balance += chargeAmount;
      users[userIndex].spending = Math.max(0, (users[userIndex].spending || 0) - chargeAmount);
      saveUsers(users);
      refundMessage = ` & $${chargeAmount.toFixed(4)} USD refunded to @${order.username}`;
    }
  }

  saveOrders(orders);

  res.json({
    success: true,
    message: `Order #${orderId} status updated to '${newStatus}'${refundMessage}`,
    order
  });
});

// Admin: Delete Order History Record
app.delete('/api/admin/orders/:orderId', (req, res) => {
  let orders = getOrders();
  const orderExists = orders.some(o => String(o.id) === String(req.params.orderId));

  if (!orderExists) {
    return res.status(400).json({ error: 'Order record not found' });
  }

  orders = orders.filter(o => String(o.id) !== String(req.params.orderId));
  saveOrders(orders);
  deleteOrderFromMongoDB(req.params.orderId);

  res.json({ success: true, message: 'Order record deleted permanently' });
});

// ----------------------------------------------------
// GOOGLE SHEETS BACKUP & AUTO RECOVERY API ROUTES
// ----------------------------------------------------

const googleSheets = require('./googleSheets');

// Get Google Sheets Config
app.get('/api/admin/google-sheets/config', (req, res) => {
  res.json(googleSheets.getGoogleSheetsConfig());
});

// Save Google Sheets Config
app.post('/api/admin/google-sheets/config', (req, res) => {
  const { webhook_url, enabled } = req.body;
  const updated = googleSheets.saveGoogleSheetsConfig({ webhook_url, enabled });
  res.json({ success: true, config: updated });
});

// Trigger Instant Manual Backup to Google Sheets
app.post('/api/admin/google-sheets/backup', async (req, res) => {
  const result = await googleSheets.syncToGoogleSheets(db);
  res.json(result);
});

// Trigger Manual Data Recovery from Google Sheets
app.post('/api/admin/google-sheets/restore', async (req, res) => {
  const result = await googleSheets.restoreFromGoogleSheets(db);
  res.json(result);
});

// Test Connection with Google Sheets Webhook
app.post('/api/admin/google-sheets/test', async (req, res) => {
  const { url } = req.body;
  const result = await googleSheets.testGoogleSheetsConnection(url);
  res.json(result);
});

// ----------------------------------------------------
// TELEGRAM BOT ADMIN CONFIG & TEST API ROUTES
// ----------------------------------------------------

// Get Telegram Bot Config & Status
app.get('/api/admin/telegram/config', (req, res) => {
  const config = db.getTelegramConfig();
  res.json({
    bot_token: config.bot_token || '',
    admin_chat_id: config.admin_chat_id || '',
    polling_active: telegramBot.polling
  });
});

// Update Telegram Bot Config & Restart Polling
app.post('/api/admin/telegram/config', (req, res) => {
  const { bot_token, admin_chat_id } = req.body;
  const currentConfig = db.getTelegramConfig();
  
  const newConfig = {
    bot_token: bot_token !== undefined ? bot_token.trim() : currentConfig.bot_token,
    admin_chat_id: admin_chat_id !== undefined ? admin_chat_id.trim() : currentConfig.admin_chat_id
  };

  db.saveTelegramConfig(newConfig);
  telegramBot.restartPolling();

  res.json({ success: true, config: newConfig, message: 'Telegram Bot Configuration saved successfully!' });
});

// Test Connection with Telegram Admin Chat
app.post('/api/admin/telegram/test', async (req, res) => {
  const { chatId } = req.body;
  const config = db.getTelegramConfig();
  const targetChatId = chatId || config.admin_chat_id;

  if (!config.bot_token) {
    return res.status(400).json({ error: 'Telegram Bot Token missing. Configure TELEGRAM_BOT_TOKEN first.' });
  }

  if (!targetChatId) {
    return res.status(400).json({ error: 'Admin Chat ID missing. Send /start to your bot in Telegram or enter Admin Chat ID.' });
  }

  const testMsg = 
`🔔 <b>DARKBOOSTER TELEGRAM BOT TEST ALERT</b>

✅ Your Telegram Bot is 100% connected & working properly!
📅 <b>Time:</b> ${new Date().toLocaleString()}
🌐 <b>Host:</b> ${process.env.RENDER ? 'Render Cloud Host' : 'Local Laptop Host'}

You will receive real-time alerts here for:
1. 🆕 New User Registrations
2. 💰 Deposit Requests (with 1-Click Approve/Reject buttons)`;

  const result = await telegramBot.sendMessage(targetChatId, testMsg);
  if (result && result.ok) {
    res.json({ success: true, message: `Test notification sent to Telegram Admin (${targetChatId}) successfully!` });
  } else {
    res.status(500).json({ error: 'Failed to send Telegram test message. Check Bot Token and Chat ID.' });
  }
});

// Filter missing static assets so they return 404 instead of serving index.html
app.use((req, res, next) => {
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|json|woff|woff2|ttf|eot)$/i)) {
    return res.status(404).send('Static asset not found');
  }
  next();
});

// Admin Manual Order Status Sync
app.post('/api/admin/orders/sync-status', async (req, res) => {
  const result = await syncOrdersStatusFromProvider();
  res.json({ success: true, message: 'Order statuses synced with SMM Provider API', updatedCount: result ? result.updatedCount : 0 });
});

// Background Auto-Sync Orders Status from Provider API
async function syncOrdersStatusFromProvider() {
  try {
    const orders = getOrders();
    const activeOrders = orders.filter(o => o.id && (o.status === 'Pending' || o.status === 'In progress' || o.status === 'Processing'));
    if (activeOrders.length === 0) return { updatedCount: 0 };

    const orderIds = activeOrders.slice(0, 100).map(o => o.id).join(',');
    const statusData = await callSmmApi({ action: 'status', orders: orderIds });

    let updatedCount = 0;
    if (statusData && typeof statusData === 'object') {
      const allOrders = getOrders();

      for (const orderId in statusData) {
        const info = statusData[orderId];
        if (info && info.status) {
          const idx = allOrders.findIndex(o => String(o.id) === String(orderId));
          if (idx !== -1) {
            const formattedStatus = info.status.charAt(0).toUpperCase() + info.status.slice(1);
            if (allOrders[idx].status !== formattedStatus || (info.remains !== undefined && allOrders[idx].remains !== info.remains)) {
              allOrders[idx].status = formattedStatus;
              if (info.remains !== undefined) allOrders[idx].remains = info.remains;
              updatedCount++;
            }
          }
        }
      }

      if (updatedCount > 0) {
        saveOrders(allOrders);
        console.log(`🔄 Synced ${updatedCount} SMM provider order statuses`);
      }
    }
    return { updatedCount };
  } catch (err) {
    console.error('syncOrdersStatusFromProvider error:', err.message);
    return { updatedCount: 0 };
  }
}

// Start Server & Background Cron
app.listen(PORT, () => {
  console.log(`🚀 Dark Booster SMM Panel running on http://localhost:${PORT}`);
  telegramBot.startPolling();

  // Run Order status auto-sync every 3 minutes
  setInterval(syncOrdersStatusFromProvider, 3 * 60 * 1000);
});

