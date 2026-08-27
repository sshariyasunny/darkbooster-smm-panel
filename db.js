const fs = require('fs');
const path = require('path');
require('dotenv').config();

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
// ATOMIC & CRASH-PROOF FILE I/O HELPERS
// -------------------------------------------------------------

function safeReadJson(filePath, fallbackValue = []) {
  const bakPath = filePath + '.bak';
  
  // Try reading primary JSON file
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
      console.error(`⚠️ Warning: Error reading ${path.basename(filePath)}: ${err.message}. Attempting restore from backup...`);
    }
  }

  // Fallback to .bak file if primary is missing or corrupted
  if (fs.existsSync(bakPath)) {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf8').trim();
      if (bakContent) {
        const parsedBak = JSON.parse(bakContent);
        // Restore primary file from valid backup
        safeWriteJson(filePath, parsedBak);
        console.log(`✅ Restored ${path.basename(filePath)} successfully from backup file.`);
        return parsedBak;
      }
    } catch (err) {
      console.error(`❌ Error restoring ${path.basename(filePath)} from backup: ${err.message}`);
    }
  }

  return fallbackValue;
}

function safeWriteJson(filePath, data) {
  try {
    const jsonString = JSON.stringify(data, null, 2);
    const tmpPath = filePath + '.tmp';
    const bakPath = filePath + '.bak';

    // Create backup of current valid file before overwriting
    if (fs.existsSync(filePath)) {
      try {
        const currentContent = fs.readFileSync(filePath, 'utf8').trim();
        if (currentContent && currentContent.length > 2) {
          fs.writeFileSync(bakPath, currentContent, 'utf8');
        }
      } catch (e) {}
    }

    // Atomic Write: Write to .tmp first, then rename atomically
    fs.writeFileSync(tmpPath, jsonString, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`❌ Critical error writing file ${path.basename(filePath)}:`, err.message);
  }
}

// Initial File Verification & Admin Seed
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

// -------------------------------------------------------------
// PUBLIC DATA ACCESS METHODS
// -------------------------------------------------------------

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

// Attempt auto-recovery from Google Sheets if local storage is missing or empty
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
