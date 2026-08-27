/**
 * Dark Booster SMM Panel - Google Sheets Backup & Recovery Apps Script
 * -------------------------------------------------------------------
 * INSTRUCTIONS:
 * 1. Open Google Sheets (https://sheets.google.com) and create a New Blank Spreadsheet.
 * 2. Click "Extensions" -> "Apps Script".
 * 3. Delete any default code in Code.gs and paste this ENTIRE code.
 * 4. Click "Deploy" (top right) -> "New deployment".
 * 5. Click the gear icon ⚙️ next to "Select type" -> choose "Web app".
 * 6. Execute as: "Me"
 * 7. Who has access: "Anyone" (CRITICAL step!)
 * 8. Click "Deploy" -> "Authorize access" -> Allow.
 * 9. Copy the "Web app URL" and paste it in Dark Booster Admin Panel -> Google Sheets Settings.
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

    // Sync Action: Save Users, Deposits, Orders to Sheets
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Raw Backup Sheet (JSON storage for 100% loss-less exact recovery)
    var backupSheet = getOrCreateSheet(ss, "RawBackup");
    backupSheet.clear();
    backupSheet.getRange(1, 1).setValue("BACKUP_DATA");
    backupSheet.getRange(2, 1).setValue(JSON.stringify({
      users: data.users || [],
      deposits: data.deposits || [],
      orders: data.orders || [],
      updated_at: new Date().toISOString()
    }));

    // 2. Users Sheet (Human Readable)
    if (data.users && Array.isArray(data.users)) {
      var usersSheet = getOrCreateSheet(ss, "Users");
      usersSheet.clear();
      usersSheet.appendRow(["User ID", "Name", "Username", "Email", "Phone", "Balance ($)", "Spending ($)", "Role", "Date"]);
      data.users.forEach(function(u) {
        usersSheet.appendRow([u.id, u.name, u.username, u.email, u.phone || '', u.balance, u.spending || 0, u.role, u.created_at || '']);
      });
    }

    // 3. Deposits Sheet (Human Readable)
    if (data.deposits && Array.isArray(data.deposits)) {
      var depSheet = getOrCreateSheet(ss, "Deposits");
      depSheet.clear();
      depSheet.appendRow(["Deposit ID", "User ID", "Username", "Method", "Trx ID", "Sender", "Amount BDT", "Amount USD", "Status", "Date"]);
      data.deposits.forEach(function(d) {
        depSheet.appendRow([d.id, d.user_id, d.username, d.method, d.trx_id, d.sender_number || '', d.amount_bdt, d.amount_usd, d.status, d.date]);
      });
    }

    // 4. Orders Sheet (Human Readable)
    if (data.orders && Array.isArray(data.orders)) {
      var ordSheet = getOrCreateSheet(ss, "Orders");
      ordSheet.clear();
      ordSheet.appendRow(["Order ID", "User ID", "Username", "Service ID", "Service Name", "Link", "Quantity", "Charge ($)", "Status", "Remains", "Date"]);
      data.orders.forEach(function(o) {
        ordSheet.appendRow([o.id, o.user_id, o.username, o.service_id, o.service_name, o.link, o.quantity, o.charge, o.status, o.remains || 0, o.date]);
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      message: 'Data backed up to Google Sheets successfully!',
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

function getBackupDataResponse() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var backupSheet = ss.getSheetByName("RawBackup");
    if (!backupSheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'No RawBackup sheet found in Google Sheet.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var jsonStr = backupSheet.getRange(2, 1).getValue();
    if (!jsonStr) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        message: 'RawBackup sheet is empty.'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var parsed = JSON.parse(jsonStr);
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      users: parsed.users || [],
      deposits: parsed.deposits || [],
      orders: parsed.orders || [],
      updated_at: parsed.updated_at
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}
