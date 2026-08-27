/**
 * Dark Booster SMM Panel - Smart Non-Destructive Google Sheets Backup & Recovery Apps Script
 * -------------------------------------------------------------------
 * INSTRUCTIONS:
 * 1. Open your Google Sheet (https://sheets.google.com).
 * 2. Click "Extensions" -> "Apps Script".
 * 3. Replace ALL existing code in Code.gs with this ENTIRE code.
 * 4. Click "Deploy" (top right) -> "Manage deployments" -> Click Edit (pencil icon) -> Version: "New version" -> Click "Deploy".
 *    (Or if setting up for the 1st time: "New deployment" -> Select "Web app" -> Execute as: "Me" -> Who has access: "Anyone").
 * 5. Copy the Web app URL and paste it into SMM Admin Panel -> Google Sheets Settings.
 */

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    
    var action = data.action || 'sync';

    if (action === 'restore' || action === 'fetch') {
      return getBackupDataResponse();
    }

    if (action === 'ping' || action === 'test') {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Google Sheets Backup Webhook is online & active!'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // Sync Action: NON-DESTRUCTIVE Merge of Users, Deposits, Orders to Sheets
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Sync Users Sheet (Non-destructive merge)
    if (data.users && Array.isArray(data.users)) {
      syncUsersSheet(ss, data.users);
    }

    // 2. Sync Deposits Sheet (Non-destructive merge)
    if (data.deposits && Array.isArray(data.deposits)) {
      syncDepositsSheet(ss, data.deposits);
    }

    // 3. Sync Orders Sheet (Non-destructive merge)
    if (data.orders && Array.isArray(data.orders)) {
      syncOrdersSheet(ss, data.orders);
    }

    // 4. Update RawBackup Sheet from current Sheet Data
    updateRawBackupFromSheets(ss);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data merged & backed up to Google Sheets successfully without deleting existing records!',
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return getBackupDataResponse();
}

// -------------------------------------------------------------
// NON-DESTRUCTIVE SYNC HELPERS (Never call sheet.clear())
// -------------------------------------------------------------

function syncUsersSheet(ss, incomingUsers) {
  var sheet = getOrCreateSheet(ss, "Users");
  var lastRow = sheet.getLastRow();
  
  if (lastRow === 0) {
    sheet.appendRow(["User ID", "Name", "Username", "Email", "Phone", "Balance ($)", "Spending ($)", "Role", "Date", "Password"]);
    lastRow = 1;
  }

  // Build index map of existing users by User ID or Username -> Row Index (1-based)
  var existingMap = {};
  if (lastRow > 1) {
    var range = sheet.getRange(2, 1, lastRow - 1, 10);
    var values = range.getValues();
    for (var i = 0; i < values.length; i++) {
      var uid = String(values[i][0] || '').trim();
      var uname = String(values[i][2] || '').trim().toLowerCase();
      if (uid) existingMap[uid] = i + 2;
      if (uname) existingMap[uname] = i + 2;
    }
  }

  incomingUsers.forEach(function(u) {
    if (!u) return;
    var uid = String(u.id || '').trim();
    var uname = String(u.username || '').trim().toLowerCase();
    
    var targetRowIndex = existingMap[uid] || existingMap[uname];
    var rowValues = [
      u.id || '',
      u.name || '',
      u.username || '',
      u.email || '',
      u.phone || '',
      u.balance !== undefined ? u.balance : 0,
      u.spending !== undefined ? u.spending : 0,
      u.role || 'user',
      u.created_at || '',
      u.password || ''
    ];

    if (targetRowIndex) {
      sheet.getRange(targetRowIndex, 1, 1, 10).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      var newRowIndex = sheet.getLastRow();
      if (uid) existingMap[uid] = newRowIndex;
      if (uname) existingMap[uname] = newRowIndex;
    }
  });
}

function syncDepositsSheet(ss, incomingDeposits) {
  var sheet = getOrCreateSheet(ss, "Deposits");
  var lastRow = sheet.getLastRow();
  
  if (lastRow === 0) {
    sheet.appendRow(["Deposit ID", "User ID", "Username", "Method", "Trx ID", "Sender", "Amount BDT", "Amount USD", "Status", "Date"]);
    lastRow = 1;
  }

  var existingMap = {};
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
    for (var i = 0; i < values.length; i++) {
      var depId = String(values[i][0] || '').trim();
      var trxId = String(values[i][4] || '').trim();
      if (depId) existingMap[depId] = i + 2;
      if (trxId) existingMap[trxId] = i + 2;
    }
  }

  incomingDeposits.forEach(function(d) {
    if (!d) return;
    var depId = String(d.id || '').trim();
    var trxId = String(d.trx_id || '').trim();
    
    var targetRowIndex = existingMap[depId] || existingMap[trxId];
    var rowValues = [
      d.id || '',
      d.user_id || '',
      d.username || '',
      d.method || '',
      d.trx_id || '',
      d.sender_number || '',
      d.amount_bdt !== undefined ? d.amount_bdt : 0,
      d.amount_usd !== undefined ? d.amount_usd : 0,
      d.status || 'pending',
      d.date || ''
    ];

    if (targetRowIndex) {
      sheet.getRange(targetRowIndex, 1, 1, 10).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      var newRowIndex = sheet.getLastRow();
      if (depId) existingMap[depId] = newRowIndex;
      if (trxId) existingMap[trxId] = newRowIndex;
    }
  });
}

function syncOrdersSheet(ss, incomingOrders) {
  var sheet = getOrCreateSheet(ss, "Orders");
  var lastRow = sheet.getLastRow();
  
  if (lastRow === 0) {
    sheet.appendRow(["Order ID", "User ID", "Username", "Service ID", "Service Name", "Link", "Quantity", "Charge ($)", "Status", "Remains", "Date"]);
    lastRow = 1;
  }

  var existingMap = {};
  if (lastRow > 1) {
    var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
    for (var i = 0; i < values.length; i++) {
      var ordId = String(values[i][0] || '').trim();
      if (ordId) existingMap[ordId] = i + 2;
    }
  }

  incomingOrders.forEach(function(o) {
    if (!o) return;
    var ordId = String(o.id || '').trim();
    var targetRowIndex = existingMap[ordId];

    var rowValues = [
      o.id || '',
      o.user_id || '',
      o.username || '',
      o.service_id || '',
      o.service_name || '',
      o.link || '',
      o.quantity !== undefined ? o.quantity : 0,
      o.charge !== undefined ? o.charge : 0,
      o.status || 'Pending',
      o.remains !== undefined ? o.remains : 0,
      o.date || ''
    ];

    if (targetRowIndex) {
      sheet.getRange(targetRowIndex, 1, 1, 11).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
      var newRowIndex = sheet.getLastRow();
      if (ordId) existingMap[ordId] = newRowIndex;
    }
  });
}

// -------------------------------------------------------------
// READ LIVE DATA FROM SHEETS (Respects manual row deletions)
// -------------------------------------------------------------

function getBackupDataResponse() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    var users = readUsersFromSheet(ss);
    var deposits = readDepositsFromSheet(ss);
    var orders = readOrdersFromSheet(ss);

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      users: users,
      deposits: deposits,
      orders: orders,
      updated_at: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function readUsersFromSheet(ss) {
  var sheet = ss.getSheetByName("Users");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var users = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    var username = String(row[2] || '').trim();
    if (!id && !username) continue; // Skip empty/manually cleared rows

    users.push({
      id: id || ('usr_' + Date.now() + '_' + i),
      name: String(row[1] || ''),
      username: username,
      email: String(row[3] || ''),
      phone: String(row[4] || ''),
      balance: parseFloat(row[5]) || 0,
      spending: parseFloat(row[6]) || 0,
      role: String(row[7] || 'user'),
      created_at: String(row[8] || ''),
      password: String(row[9] || ''),
      is_deleted: false
    });
  }
  return users;
}

function readDepositsFromSheet(ss) {
  var sheet = ss.getSheetByName("Deposits");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  var deposits = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    var trx_id = String(row[4] || '').trim();
    if (!id && !trx_id) continue;

    deposits.push({
      id: id || ('dep_' + Date.now() + '_' + i),
      user_id: String(row[1] || ''),
      username: String(row[2] || ''),
      method: String(row[3] || ''),
      trx_id: trx_id,
      sender_number: String(row[5] || ''),
      amount_bdt: parseFloat(row[6]) || 0,
      amount_usd: parseFloat(row[7]) || 0,
      status: String(row[8] || 'pending'),
      date: String(row[9] || '')
    });
  }
  return deposits;
}

function readOrdersFromSheet(ss) {
  var sheet = ss.getSheetByName("Orders");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var orders = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    if (!id) continue;

    orders.push({
      id: id,
      user_id: String(row[1] || ''),
      username: String(row[2] || ''),
      service_id: String(row[3] || ''),
      service_name: String(row[4] || ''),
      link: String(row[5] || ''),
      quantity: parseInt(row[6]) || 0,
      charge: parseFloat(row[7]) || 0,
      status: String(row[8] || 'Pending'),
      remains: parseInt(row[9]) || 0,
      date: String(row[10] || '')
    });
  }
  return orders;
}

function updateRawBackupFromSheets(ss) {
  var backupSheet = getOrCreateSheet(ss, "RawBackup");
  backupSheet.clear();
  backupSheet.getRange(1, 1).setValue("BACKUP_DATA");
  
  var users = readUsersFromSheet(ss);
  var deposits = readDepositsFromSheet(ss);
  var orders = readOrdersFromSheet(ss);

  backupSheet.getRange(2, 1).setValue(JSON.stringify({
    users: users,
    deposits: deposits,
    orders: orders,
    updated_at: new Date().toISOString()
  }));
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}
