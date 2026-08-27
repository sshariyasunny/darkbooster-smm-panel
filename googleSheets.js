const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const configPath = path.join(dataDir, 'google_sheets_config.json');

// Debounce timer for auto sync
let syncDebounceTimer = null;

function getGoogleSheetsConfig() {
  let webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL || '';
  let enabled = true;
  let lastSync = null;

  if (fs.existsSync(configPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data.webhook_url) webhookUrl = data.webhook_url;
      if (data.enabled !== undefined) enabled = data.enabled;
      if (data.last_sync) lastSync = data.last_sync;
    } catch (e) {}
  }

  return { webhook_url: webhookUrl.trim(), enabled, last_sync: lastSync };
}

function saveGoogleSheetsConfig(config) {
  const current = getGoogleSheetsConfig();
  const updated = {
    webhook_url: (config.webhook_url !== undefined ? config.webhook_url : current.webhook_url).trim(),
    enabled: config.enabled !== undefined ? config.enabled : current.enabled,
    last_sync: config.last_sync !== undefined ? config.last_sync : current.last_sync
  };
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

// Push current data (users, deposits, orders) to Google Sheets
async function syncToGoogleSheets(db) {
  const config = getGoogleSheetsConfig();
  if (!config.webhook_url || !config.enabled) {
    return { success: false, error: 'Google Sheets Webhook URL is not configured' };
  }

  try {
    const users = db.getUsers ? db.getUsers() : [];
    const deposits = db.getDeposits ? db.getDeposits() : [];
    const orders = db.getOrders ? db.getOrders() : [];

    const payload = {
      action: 'sync',
      users,
      deposits,
      orders,
      timestamp: new Date().toISOString()
    };

    const res = await fetch(config.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { message: text }; }

    if (res.ok || (data && data.status === 'success')) {
      const nowStr = new Date().toLocaleString();
      saveGoogleSheetsConfig({ last_sync: nowStr });
      console.log(`✅ [Google Sheets] Data synced successfully at ${nowStr}`);
      return { success: true, message: 'Backed up to Google Sheets successfully', last_sync: nowStr };
    } else {
      console.error('❌ [Google Sheets] Backup failed:', text);
      return { success: false, error: data.message || 'Failed to sync with Google Sheets' };
    }
  } catch (err) {
    console.error('❌ [Google Sheets] Sync error:', err.message);
    return { success: false, error: err.message };
  }
}

// Trigger debounced background sync
function triggerDebouncedSync(db) {
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncToGoogleSheets(db).catch(err => {
      console.error('[Google Sheets] Debounced sync error:', err.message);
    });
  }, 5000); // 5 second debounce
}

// Fetch backup data from Google Sheets and restore local data files
async function restoreFromGoogleSheets(db) {
  const config = getGoogleSheetsConfig();
  if (!config.webhook_url) {
    return { success: false, error: 'Google Sheets Webhook URL is not configured' };
  }

  try {
    // Try POST with action: 'restore' or GET request
    let responseData = null;

    try {
      const res = await fetch(config.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
        redirect: 'follow'
      });
      const text = await res.text();
      responseData = JSON.parse(text);
    } catch (e) {
      // Fallback to GET request
      const resGet = await fetch(config.webhook_url, { redirect: 'follow' });
      const textGet = await resGet.text();
      responseData = JSON.parse(textGet);
    }

    if (!responseData || (responseData.status !== 'success' && !responseData.users)) {
      return { 
        success: false, 
        error: responseData ? (responseData.message || 'No valid backup data returned from Google Sheets') : 'Empty response from Google Sheets' 
      };
    }

    let restoredCount = 0;

    if (responseData.users && Array.isArray(responseData.users) && responseData.users.length > 0) {
      db.saveUsers(responseData.users);
      restoredCount += responseData.users.length;
    }

    if (responseData.deposits && Array.isArray(responseData.deposits)) {
      db.saveDeposits(responseData.deposits);
    }

    if (responseData.orders && Array.isArray(responseData.orders)) {
      db.saveOrders(responseData.orders);
    }

    console.log(`✅ [Google Sheets Recovery] Successfully restored data from Google Sheets!`);
    return {
      success: true,
      message: `Successfully recovered ${responseData.users ? responseData.users.length : 0} users, ${responseData.deposits ? responseData.deposits.length : 0} deposits, and ${responseData.orders ? responseData.orders.length : 0} orders from Google Sheets!`,
      data: responseData
    };
  } catch (err) {
    console.error('❌ [Google Sheets Recovery Error]:', err.message);
    return { success: false, error: 'Recovery failed: ' + err.message };
  }
}

// Test webhook connection
async function testGoogleSheetsConnection(url) {
  const targetUrl = url || getGoogleSheetsConfig().webhook_url;
  if (!targetUrl) {
    return { success: false, error: 'Please enter a Google Sheets Webhook URL first.' };
  }

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping' }),
      redirect: 'follow'
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = { message: text }; }

    if (res.ok || (data && data.status === 'success')) {
      return { success: true, message: 'Google Sheets Webhook connection successful!' };
    } else {
      return { success: false, error: 'Google Sheets returned error: ' + (data.message || text) };
    }
  } catch (err) {
    return { success: false, error: 'Connection test failed: ' + err.message };
  }
}

// Auto recover from Google Sheets if local storage is missing or empty
async function autoRecoverIfEmpty(db) {
  const users = db.getUsers();
  const orders = db.getOrders();

  // If only default admin exists and no orders, attempt auto recovery from Google Sheets
  const isEssentiallyEmpty = users.length <= 1 && orders.length === 0;

  if (isEssentiallyEmpty) {
    const config = getGoogleSheetsConfig();
    if (config.webhook_url && config.enabled) {
      console.log('⚠️ Local database is empty. Attempting auto recovery from Google Sheets...');
      await restoreFromGoogleSheets(db);
    }
  }
}

module.exports = {
  getGoogleSheetsConfig,
  saveGoogleSheetsConfig,
  syncToGoogleSheets,
  triggerDebouncedSync,
  restoreFromGoogleSheets,
  testGoogleSheetsConnection,
  autoRecoverIfEmpty
};
