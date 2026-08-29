const fs = require('fs');
const path = require('path');
require('dotenv').config();
const mongoose = require('mongoose');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const usersFilePath = path.join(dataDir, 'users.json');
const depositsFilePath = path.join(dataDir, 'deposits.json');
const ordersFilePath = path.join(dataDir, 'orders.json');
const telegramConfigFilePath = path.join(dataDir, 'telegram_config.json');

// Default Admin User Definition
const defaultAdmin = {
  id: 'usr_admin',
  name: 'Super Admin',
  username: 'admin',
  email: 'admin@darkbooster.com',
  phone: '01700000000',
  password: 'admin123',
  balance: 0.7937,
  spending: 0.0,
  role: 'admin',
  is_deleted: false,
  created_at: new Date().toLocaleString()
};

// -------------------------------------------------------------
// MONGODB ATLAS CLOUD SCHEMAS & SYNC SYSTEM
// -------------------------------------------------------------
let isMongoConnected = false;

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  username: String,
  email: String,
  phone: String,
  password: String,
  balance: Number,
  spending: Number,
  role: String,
  is_deleted: Boolean,
  created_at: String
}, { timestamps: true });

const depositSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  user_id: String,
  username: String,
  method: String,
  sender_number: String,
  trx_id: String,
  amount_bdt: Number,
  amount_usd: Number,
  status: String,
  date: String,
  telegram_msg_id: String
}, { timestamps: true });

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true },
  user_id: String,
  username: String,
  service_id: String,
  service_name: String,
  link: String,
  quantity: Number,
  charge: String,
  status: String,
  remains: Number,
  date: String
}, { timestamps: true });

const UserDoc = mongoose.models.User || mongoose.model('User', userSchema);
const DepositDoc = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);
const OrderDoc = mongoose.models.Order || mongoose.model('Order', orderSchema);

const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(async () => {
      console.log('✅ Connected to MongoDB Atlas Cloud Database!');
      isMongoConnected = true;
      await syncFromMongoDB();
    })
    .catch(err => {
      console.error('⚠️ MongoDB Atlas connection notice:', err.message);
    });
}

async function syncFromMongoDB() {
  if (!isMongoConnected) return;
  try {
    const mongoUsers = await UserDoc.find({}).lean();
    if (mongoUsers && mongoUsers.length > 0) {
      safeWriteJson(usersFilePath, mongoUsers.map(({ _id, __v, ...u }) => u));
    }
    const mongoDeposits = await DepositDoc.find({}).lean();
    if (mongoDeposits) {
      safeWriteJson(depositsFilePath, mongoDeposits.map(({ _id, __v, ...d }) => d));
    }
    const mongoOrders = await OrderDoc.find({}).lean();
    if (mongoOrders) {
      safeWriteJson(ordersFilePath, mongoOrders.map(({ _id, __v, ...o }) => o));
    }
    console.log('🔄 Synced local cache from MongoDB Atlas Cloud DB');
  } catch (err) {
    console.error('syncFromMongoDB error:', err.message);
  }
}

async function syncUsersToMongoDB(users) {
  if (!isMongoConnected || !Array.isArray(users)) return;
  try {
    for (const u of users) {
      await UserDoc.findOneAndUpdate({ id: u.id }, u, { upsert: true, new: true });
    }
  } catch (err) {
    console.error('syncUsersToMongoDB error:', err.message);
  }
}

async function syncDepositsToMongoDB(deposits) {
  if (!isMongoConnected || !Array.isArray(deposits)) return;
  try {
    for (const d of deposits) {
      await DepositDoc.findOneAndUpdate({ id: d.id }, d, { upsert: true, new: true });
    }
  } catch (err) {
    console.error('syncDepositsToMongoDB error:', err.message);
  }
}

async function syncOrdersToMongoDB(orders) {
  if (!isMongoConnected || !Array.isArray(orders)) return;
  try {
    for (const o of orders) {
      await OrderDoc.findOneAndUpdate({ id: o.id }, o, { upsert: true, new: true });
    }
  } catch (err) {
    console.error('syncOrdersToMongoDB error:', err.message);
  }
}

// -------------------------------------------------------------
// ATOMIC & CRASH-PROOF FILE I/O HELPERS
// -------------------------------------------------------------

function safeReadJson(filePath, fallbackValue = []) {
  const bakPath = filePath + '.bak';
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) || typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (err) {
      console.error(`⚠️ Warning: Error reading ${path.basename(filePath)}: ${err.message}`);
    }
  }

  if (fs.existsSync(bakPath)) {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf8').trim();
      if (bakContent) {
        const parsedBak = JSON.parse(bakContent);
        safeWriteJson(filePath, parsedBak);
        return parsedBak;
      }
    } catch (err) {}
  }

  return fallbackValue;
}

function safeWriteJson(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const tmpPath = filePath + '.tmp';
    const bakPath = filePath + '.bak';

    if (fs.existsSync(filePath)) {
      try {
        const currentContent = fs.readFileSync(filePath, 'utf8').trim();
        if (currentContent && currentContent.length > 2) {
          fs.writeFileSync(bakPath, currentContent, 'utf8');
        }
      } catch (e) {}
    }

    fs.writeFileSync(tmpPath, jsonString, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`❌ Error writing file ${path.basename(filePath)}:`, err.message);
  }
}

// Initial Storage Setup
function initStorage() {
  const users = safeReadJson(usersFilePath, []);
  if (!Array.isArray(users) || users.length === 0) {
    safeWriteJson(usersFilePath, [defaultAdmin]);
  } else {
    if (!users.some(u => u.username === 'admin')) {
      users.unshift(defaultAdmin);
      safeWriteJson(usersFilePath, users);
    }
  }

  if (!fs.existsSync(depositsFilePath)) {
    safeWriteJson(depositsFilePath, []);
  }
  if (!fs.existsSync(ordersFilePath)) {
    safeWriteJson(ordersFilePath, []);
  }
}

const googleSheets = require('./googleSheets');

initStorage();

const dbExports = {
  getUsers,
  saveUsers,
  getDeposits,
  saveDeposits,
  getOrders,
  saveOrders,
  getTelegramConfig,
  saveTelegramConfig,
  defaultAdmin
};

setTimeout(() => {
  googleSheets.autoRecoverIfEmpty(dbExports).catch(() => {});
}, 1000);

function getUsers() {
  const users = safeReadJson(usersFilePath, [defaultAdmin]);
  if (!users.some(u => u.username === 'admin')) {
    users.unshift(defaultAdmin);
  }
  return users;
}

function saveUsers(users, skipSync = false) {
  if (!Array.isArray(users)) return;
  if (!users.some(u => u.username === 'admin')) {
    users.unshift(defaultAdmin);
  }
  safeWriteJson(usersFilePath, users);
  syncUsersToMongoDB(users).catch(() => {});
  if (!skipSync) {
    googleSheets.triggerDebouncedSync(dbExports);
  }
}

function getDeposits() {
  return safeReadJson(depositsFilePath, []);
}

function saveDeposits(deposits, skipSync = false) {
  if (!Array.isArray(deposits)) return;
  safeWriteJson(depositsFilePath, deposits);
  syncDepositsToMongoDB(deposits).catch(() => {});
  if (!skipSync) {
    googleSheets.triggerDebouncedSync(dbExports);
  }
}

function getOrders() {
  return safeReadJson(ordersFilePath, []);
}

function saveOrders(orders, skipSync = false) {
  if (!Array.isArray(orders)) return;
  safeWriteJson(ordersFilePath, orders);
  syncOrdersToMongoDB(orders).catch(() => {});
  if (!skipSync) {
    googleSheets.triggerDebouncedSync(dbExports);
  }
}

function getTelegramConfig() {
  let config = {
    bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
    admin_chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID || ''
  };

  const fileData = safeReadJson(telegramConfigFilePath, {});
  if (fileData.bot_token && !config.bot_token) {
    config.bot_token = fileData.bot_token;
  }
  if (fileData.admin_chat_id && !config.admin_chat_id) {
    config.admin_chat_id = fileData.admin_chat_id;
  }

  return config;
}

function saveTelegramConfig(config) {
  safeWriteJson(telegramConfigFilePath, config);
}

module.exports = dbExports;
