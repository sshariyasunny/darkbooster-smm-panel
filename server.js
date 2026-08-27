const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const API_URL = process.env.SMM_API_URL || 'https://bestfollows.com/api/v2';
const API_KEY = process.env.SMM_API_KEY || '5c5315c5a80c0758b866af2b5f6c40af';
const BDT_EXCHANGE_RATE = 127.0; // 1 USD = 127 BDT

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data folder and storage files exist
const dataDir = path.join(__dirname, 'data');
const usersFilePath = path.join(dataDir, 'users.json');
const depositsFilePath = path.join(dataDir, 'deposits.json');
const ordersFilePath = path.join(dataDir, 'orders.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initial Admin User Seed
const defaultAdmin = {
  id: 'usr_admin',
  name: 'Super Admin',
  username: 'admin',
  email: 'admin@bestfollows.com',
  phone: '01700000000',
  password: 'admin123',
  balance: 0.7937,
  spending: 0.0,
  role: 'admin',
  is_deleted: false,
  created_at: new Date().toLocaleString()
};

if (!fs.existsSync(usersFilePath)) {
  fs.writeFileSync(usersFilePath, JSON.stringify([defaultAdmin], null, 2), 'utf8');
} else {
  const users = JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
  if (!users.some(u => u.username === 'admin')) {
    users.unshift(defaultAdmin);
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
  }
}

if (!fs.existsSync(depositsFilePath)) {
  fs.writeFileSync(depositsFilePath, JSON.stringify([], null, 2), 'utf8');
}
if (!fs.existsSync(ordersFilePath)) {
  fs.writeFileSync(ordersFilePath, JSON.stringify([], null, 2), 'utf8');
}

// Data Helper Functions
function getUsers() {
  try {
    return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
  } catch (e) {
    return [defaultAdmin];
  }
}

function saveUsers(users) {
  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), 'utf8');
}

function getDeposits() {
  try {
    return JSON.parse(fs.readFileSync(depositsFilePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveDeposits(deposits) {
  fs.writeFileSync(depositsFilePath, JSON.stringify(deposits, null, 2), 'utf8');
}

function getOrders() {
  try {
    return JSON.parse(fs.readFileSync(ordersFilePath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveOrders(orders) {
  fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2), 'utf8');
}

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
      if (adminIndex !== -1) {
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
  if (username.toLowerCase() === 'admin' || username.toLowerCase() === 'admin@bestfollows.com') {
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
  const { userId, newBalance, action, amount } = req.body;
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);

  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (newBalance !== undefined) {
    users[userIndex].balance = parseFloat(newBalance);
  } else if (action === 'add' && amount) {
    users[userIndex].balance += parseFloat(amount);
  } else if (action === 'subtract' && amount) {
    users[userIndex].balance = Math.max(0, users[userIndex].balance - parseFloat(amount));
  }

  saveUsers(users);
  const { password: _, ...userSafe } = users[userIndex];
  res.json({ success: true, user: userSafe });
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

  res.json({ success: true, message: 'User account permanently deleted' });
});

// Admin: Get All Deposits
app.get('/api/admin/deposits', (req, res) => {
  const deposits = getDeposits();
  res.json(deposits);
});

// Admin: Approve Deposit Request
app.post('/api/admin/deposits/approve', (req, res) => {
  const { depositId } = req.body;
  const deposits = getDeposits();
  const depIndex = deposits.findIndex(d => d.id === depositId);

  if (depIndex === -1) {
    return res.status(404).json({ error: 'Deposit request not found' });
  }

  const deposit = deposits[depIndex];
  if (deposit.status === 'Approved') {
    return res.status(400).json({ error: 'Deposit request is already approved' });
  }

  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === deposit.user_id);
  if (userIndex !== -1) {
    users[userIndex].balance += deposit.amount_usd;
    saveUsers(users);
  }

  deposits[depIndex].status = 'Approved';
  saveDeposits(deposits);

  res.json({ success: true, deposit: deposits[depIndex] });
});

// Admin: Reject Deposit Request
app.post('/api/admin/deposits/reject', (req, res) => {
  const { depositId } = req.body;
  const deposits = getDeposits();
  const depIndex = deposits.findIndex(d => d.id === depositId);

  if (depIndex === -1) {
    return res.status(404).json({ error: 'Deposit request not found' });
  }

  deposits[depIndex].status = 'Rejected';
  saveDeposits(deposits);

  res.json({ success: true, deposit: deposits[depIndex] });
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

// Order Status Check
app.post('/api/status', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'order_id is required' });
    }

    const result = await callSmmApi({ action: 'status', order: order_id });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Status check failed', details: error.message });
  }
});

// Get User Orders
app.get('/api/my-orders/:userId', (req, res) => {
  const orders = getOrders();
  const userOrders = orders.filter(o => o.user_id === req.params.userId || req.params.userId === 'usr_admin');
  res.json(userOrders);
});

// Filter missing static assets so they return 404 instead of serving index.html
app.use((req, res, next) => {
  if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|json|woff|woff2|ttf|eot)$/i)) {
    return res.status(404).send('Static asset not found');
  }
  next();
});

// SPA FALLBACK ROUTE
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 BestFollows SMM Panel running on http://localhost:${PORT}`);
});
